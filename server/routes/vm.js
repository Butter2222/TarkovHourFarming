const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const proxmoxService = require('../services/proxmox');
const vmProvisioning = require('../services/vmProvisioning');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Simple cache for server overview to reduce Proxmox API calls
let serverOverviewCache = null;
let serverOverviewCacheTime = 0;
const SERVER_OVERVIEW_CACHE_TTL = 30000; // 30 seconds

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept .dat files for HWHO
    if (file.originalname.toLowerCase().endsWith('.dat')) {
      cb(null, true);
    } else {
      cb(new Error('Only .dat files are allowed'));
    }
  }
});

const router = express.Router();

// Helper function to get user-friendly setup messages
function getSetupMessage(reason) {
  const messages = {
    'no_subscription': 'No active subscription found. Purchase a subscription to get started.',
    'no_vms': 'No virtual machines assigned. VMs are created automatically after subscription activation.',
    'setup_complete_or_not_needed': 'Setup is complete or not required.',
    'error': 'Unable to determine setup status. Please try again.'
  };
  
  return messages[reason] || 'Setup status unknown.';
}

// Helper function to check if user has active subscription
const hasActiveSubscription = (user) => {
  if (!user.subscription || user.subscription.plan === 'none' || !user.subscription.plan) {
    return false;
  }
  
  if (!user.subscription.expiresAt) {
    // No expiration date means it's active (lifetime or admin)
    return true;
  }
  
  const expiryDate = new Date(user.subscription.expiresAt);
  const now = new Date();
  return expiryDate > now;
};

// Helper function to check if user can perform VM operations (excluding shutdown)
const canPerformVMOperations = (user) => {
  // Admins can always perform operations
  if (user.role === 'admin') {
    return true;
  }
  
  // Regular users need active subscription
  return hasActiveSubscription(user);
};

// Helper function to automatically shutdown user VMs when subscription is inactive
const shutdownUserVMsIfNeeded = async (user) => {
  if (user.role === 'admin') {
    return; // Don't shutdown admin VMs
  }
  
  if (hasActiveSubscription(user)) {
    return; // Subscription is active, no need to shutdown
  }
  
  // Get user's VMs and shutdown any that are running
  const userVMIds = db.getUserVMIds(user.id);
  console.log(`User ${user.username} has no active subscription. Checking ${userVMIds.length} VMs for shutdown.`);
  
  for (const vmid of userVMIds) {
    try {
      const vmStatus = await proxmoxService.getVMStatus(vmid);
      if (vmStatus.status === 'running') {
        console.log(`Auto-shutting down VM ${vmid} for user ${user.username} (no active subscription)`);
        await proxmoxService.shutdownVM(vmid);
        
        // Log the automatic shutdown
        db.logAction(
          user.id,
          'vm_auto_shutdown_no_subscription',
          'vm',
          vmid.toString(),
          { reason: 'no_active_subscription' },
          'system'
        );
      }
    } catch (error) {
      console.error(`Error auto-shutting down VM ${vmid}:`, error);
    }
  }
};

// Get server overview (admin only) - MUST be before /:vmid route
router.get('/server-overview', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    // Check cache first
    const now = Date.now();
    if (serverOverviewCache && (now - serverOverviewCacheTime) < SERVER_OVERVIEW_CACHE_TTL) {
      return res.json({
        ...serverOverviewCache,
        cached: true,
        cacheAge: Math.round((now - serverOverviewCacheTime) / 1000)
      });
    }

    // Fetch fresh data from Proxmox
    const serverData = {
      server: await proxmoxService.getNodeInfo(),
      timestamp: new Date().toISOString(),
      cached: false
    };

    // Update cache
    serverOverviewCache = serverData;
    serverOverviewCacheTime = now;

    res.json(serverData);

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

    // Check if user has active subscription and shutdown VMs if needed
    const hasActiveSub = hasActiveSubscription(user);
    if (!hasActiveSub && user.role !== 'admin') {
      await shutdownUserVMsIfNeeded(user);
    }

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
            canStart: canPerformVMOperations(user),
            canReboot: canPerformVMOperations(user),
            canStop: true, // Stop is always allowed
            canShutdown: true, // Shutdown is always allowed
            isTemplate: vm.template === 1
          };
        } catch (error) {
          console.error(`Error fetching status for VM ${vm.vmid}:`, error.message);
          return {
            ...vm,
            detailedStatus: { status: 'unknown' },
            canControl: false,
            canStart: false,
            canReboot: false,
            canStop: false,
            canShutdown: false,
            error: 'Unable to fetch detailed status',
            isTemplate: vm.template === 1
          };
        }
      })
    );

    // Sort enhanced VMs by VM ID as well
    enhancedVMs.sort((a, b) => a.vmid - b.vmid);

    console.log(`Final VM list for ${user.username}: ${enhancedVMs.length} VMs`);

    // Check setup status for non-admin users
    let setupInfo = null;
    if (user.role !== 'admin') {
      try {
        const setupCheck = await vmProvisioning.checkSetupRequired(userId);
        setupInfo = {
          required: setupCheck.required,
          reason: setupCheck.reason,
          message: getSetupMessage(setupCheck.reason),
          vmCount: setupCheck.vmCount,
          planType: setupCheck.planType
        };

        if (setupCheck.required) {
          setupInfo.setupStatus = vmProvisioning.getSetupStatus(userId);
        }
      } catch (setupError) {
        console.error('Error checking setup status:', setupError);
        setupInfo = {
          required: false,
          reason: 'error',
          message: 'Unable to determine setup status'
        };
      }
    }

    res.json({
      vms: enhancedVMs,
      total: enhancedVMs.length,
      subscription: {
        hasActive: hasActiveSub,
        plan: user.subscription?.plan || 'none',
        expiresAt: user.subscription?.expiresAt,
        restrictions: hasActiveSub ? null : {
          message: 'No active subscription. Operations are limited.',
          allowedOperations: ['shutdown', 'stop'],
          blockedOperations: ['start', 'reboot']
        }
      },
      setup: setupInfo,
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

    const user = await db.findUserById(userId);
    
    // Check subscription requirement for VM start
    if (!canPerformVMOperations(user)) {
      return res.status(403).json({ 
        error: 'Active subscription required to start VMs. Please subscribe to a plan or contact support.',
        code: 'SUBSCRIPTION_REQUIRED',
        allowedOperations: ['shutdown', 'stop'],
        subscribePath: '/dashboard/subscription'
      });
    }

    const result = await proxmoxService.startVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_start', 'vm', vmid.toString(), { taskId: result }, clientIP, userId);
    
    res.json({
      message: `VM ${vmid} start command sent successfully`,
      vmid,
      taskId: result,
      action: 'start'
    });

  } catch (error) {
    console.error(`Error starting VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_start_failed', 'vm', req.params.vmid, { error: error.message }, req.ip, req.user.id);
    res.status(500).json({ error: 'Failed to start VM' });
  }
});

// Stop VM (force stop) - Always allowed
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
    db.logAction(userId, 'vm_stop', 'vm', vmid.toString(), { taskId: result }, clientIP, userId);
    
    res.json({
      message: `VM ${vmid} stop command sent successfully`,
      vmid,
      taskId: result,
      action: 'stop'
    });

  } catch (error) {
    console.error(`Error stopping VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_stop_failed', 'vm', req.params.vmid, { error: error.message }, req.ip, req.user.id);
    res.status(500).json({ error: 'Failed to stop VM' });
  }
});

// Shutdown VM (graceful shutdown) - Always allowed
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
    db.logAction(userId, 'vm_shutdown', 'vm', vmid.toString(), { taskId: result }, clientIP, userId);
    
    res.json({
      message: `VM ${vmid} shutdown command sent successfully`,
      vmid,
      taskId: result,
      action: 'shutdown'
    });

  } catch (error) {
    console.error(`Error shutting down VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_shutdown_failed', 'vm', req.params.vmid, { error: error.message }, req.ip, req.user.id);
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

    const user = await db.findUserById(userId);
    
    // Check subscription requirement for VM reboot
    if (!canPerformVMOperations(user)) {
      return res.status(403).json({ 
        error: 'Active subscription required to reboot VMs. Please subscribe to a plan or contact support.',
        code: 'SUBSCRIPTION_REQUIRED',
        allowedOperations: ['shutdown', 'stop'],
        subscribePath: '/dashboard/subscription'
      });
    }

    const result = await proxmoxService.rebootVM(vmid);
    
    // Log the action
    db.logAction(userId, 'vm_reboot', 'vm', vmid.toString(), { taskId: result }, clientIP, userId);
    
    res.json({
      message: `VM ${vmid} reboot command sent successfully`,
      vmid,
      taskId: result,
      action: 'reboot'
    });

  } catch (error) {
    console.error(`Error rebooting VM ${req.params.vmid}:`, error);
    // Log the failed action
    db.logAction(req.user.id, 'vm_reboot_failed', 'vm', req.params.vmid, { error: error.message }, req.ip, req.user.id);
    res.status(500).json({ error: 'Failed to reboot VM' });
  }
});

// Get VM setup status for authenticated user
router.get('/setup/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if setup is required
    const setupCheck = await vmProvisioning.checkSetupRequired(userId);
    
    if (!setupCheck.required) {
      return res.json({
        setupRequired: false,
        reason: setupCheck.reason,
        message: getSetupMessage(setupCheck.reason)
      });
    }

    // Get detailed setup status
    const setupStatus = vmProvisioning.getSetupStatus(userId);
    
    res.json({
      setupRequired: true,
      setupStatus: setupStatus,
      vmCount: setupCheck.vmCount,
      planType: setupCheck.planType
    });

  } catch (error) {
    console.error('Error fetching setup status:', error);
    res.status(500).json({ error: 'Failed to fetch setup status' });
  }
});

// Initiate VM setup process
router.post('/setup/initiate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if setup is required
    const setupCheck = await vmProvisioning.checkSetupRequired(userId);
    if (!setupCheck.required) {
      return res.status(400).json({ 
        error: 'Setup not required',
        reason: setupCheck.reason 
      });
    }

    // Initiate setup
    const initiated = vmProvisioning.initiateSetup(userId);
    if (!initiated) {
      return res.status(400).json({ error: 'Failed to initiate setup' });
    }

    // Log setup initiation
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'setup_initiated', 'vm_setup', 'initiated', {
      vmCount: setupCheck.vmCount,
      planType: setupCheck.planType
    }, clientIP, userId);

    res.json({
      message: 'Setup initiated successfully',
      setupStatus: vmProvisioning.getSetupStatus(userId)
    });

  } catch (error) {
    console.error('Error initiating setup:', error);
    res.status(500).json({ error: 'Failed to initiate setup' });
  }
});

// Upload HWHO.dat file
router.post('/setup/upload', authenticateToken, upload.single('hwhoFile'), async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`File upload received from user ${userId}:`, {
      originalName: req.file.originalname,
      size: req.file.size,
      path: req.file.path
    });

    // Handle file upload through provisioning service
    const uploadResult = await vmProvisioning.handleFileUpload(
      userId,
      req.file.path,
      req.file.originalname
    );

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.error('Error cleaning up uploaded file:', cleanupError);
    }

    res.json({
      message: 'File uploaded and distributed successfully',
      result: uploadResult,
      setupStatus: vmProvisioning.getSetupStatus(userId)
    });

  } catch (error) {
    console.error('Error handling file upload:', error);
    
    // Clean up file on error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file after error:', cleanupError);
      }
    }

    res.status(500).json({ error: 'File upload failed: ' + error.message });
  }
});

// Complete setup and start automation
router.post('/setup/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Complete setup
    const completionResult = await vmProvisioning.completeSetup(userId);
    
    res.json({
      message: 'Setup completed successfully',
      result: completionResult,
      setupStatus: vmProvisioning.getSetupStatus(userId)
    });

  } catch (error) {
    console.error('Error completing setup:', error);
    res.status(500).json({ error: 'Failed to complete setup: ' + error.message });
  }
});

module.exports = router; 