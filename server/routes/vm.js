const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const proxmoxService = require('../services/proxmox');

const router = express.Router();

// Get server overview (admin only) - MUST be before /:vmid route
router.get('/server-overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    console.log(`Admin requesting server overview`);

    const serverInfo = await proxmoxService.getNodeInfo();
    
    // Log the action
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'server_overview_access', 'server', 'proxmox_node', null, clientIP);
    
    res.json({
      server: serverInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching server overview:', error);
    res.status(500).json({ error: 'Failed to fetch server overview' });
  }
});

// Get all VMs for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Fetching VMs for user: ${user.username} (role: ${user.role || 'customer'})`);

    // Get all VMs from Proxmox
    const allVMs = await proxmoxService.getVMs();
    console.log(`Raw VMs from Proxmox:`, allVMs.map(vm => ({
      vmid: vm.vmid,
      name: vm.name,
      template: vm.template,
      status: vm.status
    })));

    // Filter out templates and sort by VM ID
    const realVMs = allVMs
      .filter(vm => vm.template !== 1) // Exclude templates
      .sort((a, b) => a.vmid - b.vmid); // Sort by VM ID

    console.log(`Real VMs (excluding templates):`, realVMs.map(vm => ({
      vmid: vm.vmid,
      name: vm.name,
      status: vm.status
    })));

    // Filter VMs based on user permissions
    let userVMs;
    if (user.role === 'admin') {
      console.log(`Admin user - showing all ${realVMs.length} VMs`);
      userVMs = realVMs;
    } else {
      const userVMIds = db.getUserVMIds(userId);
      console.log(`Customer user - assigned VM IDs: [${userVMIds.join(', ')}]`);
      userVMs = realVMs.filter(vm => userVMIds.includes(vm.vmid));
      console.log(`Filtered VMs for customer: ${userVMs.length} VMs`);
    }

    // Enhance VM data with additional info
    const enhancedVMs = await Promise.all(
      userVMs.map(async (vm) => {
        try {
          const status = await proxmoxService.getVMStatus(vm.vmid);
          return {
            ...vm,
            detailedStatus: status,
            canControl: true,
            isTemplate: vm.template === 1
          };
        } catch (error) {
          console.error(`Error fetching status for VM ${vm.vmid}:`, error.message);
          return {
            ...vm,
            detailedStatus: { status: 'unknown' },
            canControl: false,
            error: 'Unable to fetch detailed status',
            isTemplate: vm.template === 1
          };
        }
      })
    );

    // Sort enhanced VMs by VM ID as well
    enhancedVMs.sort((a, b) => a.vmid - b.vmid);

    console.log(`Final VM list for ${user.username}: ${enhancedVMs.length} VMs`);

    res.json({
      vms: enhancedVMs,
      total: enhancedVMs.length,
      debug: {
        totalProxmoxVMs: allVMs.length,
        templatesCount: allVMs.filter(vm => vm.template === 1).length,
        realVMsCount: realVMs.length,
        userAssignedVMIds: user.role === 'admin' ? 'all' : db.getUserVMIds(userId),
        availableVMIds: realVMs.map(vm => vm.vmid)
      },
      user: {
        id: user.id,
        username: user.username,
        role: user.role || 'customer'
      }
    });

  } catch (error) {
    console.error('Error fetching VMs:', error);
    res.status(500).json({ error: 'Failed to fetch VMs' });
  }
});

// Get specific VM details
router.get('/:vmid', authenticateToken, async (req, res) => {
  try {
    const vmid = parseInt(req.params.vmid);
    const userId = req.user.id;

    // Check if user can access this VM
    if (!db.canAccessVM(userId, vmid)) {
      return res.status(403).json({ error: 'Access denied to this VM' });
    }

    // Get VM status and config
    const [status, config] = await Promise.all([
      proxmoxService.getVMStatus(vmid),
      proxmoxService.getVMConfig(vmid)
    ]);

    res.json({
      vmid,
      status,
      config: {
        name: config.name || `VM-${vmid}`,
        memory: config.memory,
        cores: config.cores,
        sockets: config.sockets,
        ostype: config.ostype,
        // Only include safe config parameters
        description: config.description
      }
    });

  } catch (error) {
    console.error(`Error fetching VM ${req.params.vmid}:`, error);
    res.status(500).json({ error: 'Failed to fetch VM details' });
  }
});

// Start VM
router.post('/:vmid/start', authenticateToken, async (req, res) => {
  try {
    const vmid = parseInt(req.params.vmid);
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!db.canAccessVM(userId, vmid)) {
      return res.status(403).json({ error: 'Access denied to this VM' });
    }

    const result = await proxmoxService.startVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_start', 'vm', vmid.toString(), { taskId: result }, clientIP);
    
    res.json({
      message: `VM ${vmid} start command sent successfully`,
      vmid,
      taskId: result,
      action: 'start'
    });

  } catch (error) {
    console.error(`Error starting VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_start_failed', 'vm', req.params.vmid, { error: error.message }, req.ip);
    res.status(500).json({ error: 'Failed to start VM' });
  }
});

// Stop VM (force stop)
router.post('/:vmid/stop', authenticateToken, async (req, res) => {
  try {
    const vmid = parseInt(req.params.vmid);
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!db.canAccessVM(userId, vmid)) {
      return res.status(403).json({ error: 'Access denied to this VM' });
    }

    const result = await proxmoxService.stopVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_stop', 'vm', vmid.toString(), { taskId: result }, clientIP);
    
    res.json({
      message: `VM ${vmid} stop command sent successfully`,
      vmid,
      taskId: result,
      action: 'stop'
    });

  } catch (error) {
    console.error(`Error stopping VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_stop_failed', 'vm', req.params.vmid, { error: error.message }, req.ip);
    res.status(500).json({ error: 'Failed to stop VM' });
  }
});

// Shutdown VM (graceful shutdown)
router.post('/:vmid/shutdown', authenticateToken, async (req, res) => {
  try {
    const vmid = parseInt(req.params.vmid);
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!db.canAccessVM(userId, vmid)) {
      return res.status(403).json({ error: 'Access denied to this VM' });
    }

    const result = await proxmoxService.shutdownVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_shutdown', 'vm', vmid.toString(), { taskId: result }, clientIP);
    
    res.json({
      message: `VM ${vmid} shutdown command sent successfully`,
      vmid,
      taskId: result,
      action: 'shutdown'
    });

  } catch (error) {
    console.error(`Error shutting down VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_shutdown_failed', 'vm', req.params.vmid, { error: error.message }, req.ip);
    res.status(500).json({ error: 'Failed to shutdown VM' });
  }
});

// Reboot VM
router.post('/:vmid/reboot', authenticateToken, async (req, res) => {
  try {
    const vmid = parseInt(req.params.vmid);
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!db.canAccessVM(userId, vmid)) {
      return res.status(403).json({ error: 'Access denied to this VM' });
    }

    const result = await proxmoxService.rebootVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_reboot', 'vm', vmid.toString(), { taskId: result }, clientIP);
    
    res.json({
      message: `VM ${vmid} reboot command sent successfully`,
      vmid,
      taskId: result,
      action: 'reboot'
    });

  } catch (error) {
    console.error(`Error rebooting VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_reboot_failed', 'vm', req.params.vmid, { error: error.message }, req.ip);
    res.status(500).json({ error: 'Failed to reboot VM' });
  }
});

module.exports = router; 