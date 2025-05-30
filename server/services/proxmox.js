const axios = require('axios');
const https = require('https');

class ProxmoxService {
  constructor() {
    this.host = process.env.PROXMOX_HOST;
    this.username = process.env.PROXMOX_USERNAME;
    this.password = process.env.PROXMOX_PASSWORD;
    this.node = process.env.PROXMOX_NODE;
    this.ticket = null;
    this.csrfToken = null;
    this.ticketExpiry = null;

    // Create axios instance with SSL verification disabled (for self-signed certs)
    this.client = axios.create({
      baseURL: this.host,
      timeout: 30000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });
  }

  async authenticate() {
    try {
      const response = await this.client.post('/api2/json/access/ticket', {
        username: this.username,
        password: this.password
      });

      if (response.data && response.data.data) {
        this.ticket = response.data.data.ticket;
        this.csrfToken = response.data.data.CSRFPreventionToken;
        // Proxmox tickets are valid for 2 hours
        this.ticketExpiry = Date.now() + (2 * 60 * 60 * 1000);
        
        // Set default headers for authenticated requests
        this.client.defaults.headers.common['Cookie'] = `PVEAuthCookie=${this.ticket}`;
        this.client.defaults.headers.common['CSRFPreventionToken'] = this.csrfToken;
        
        console.log('✅ Proxmox authentication successful');
        return true;
      }
      throw new Error('Authentication failed - no ticket received');
    } catch (error) {
      console.error('❌ Proxmox authentication failed:', error.message);
      throw new Error(`Proxmox authentication failed: ${error.message}`);
    }
  }

  async ensureAuthenticated() {
    if (!this.ticket || !this.ticketExpiry || Date.now() >= this.ticketExpiry) {
      await this.authenticate();
    }
  }

  async getVMs() {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.get(`/api2/json/nodes/${this.node}/qemu`);
      return response.data.data || [];
    } catch (error) {
      console.error('Error fetching VMs:', error.message);
      throw new Error(`Failed to fetch VMs: ${error.message}`);
    }
  }

  async getVMStatus(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.get(`/api2/json/nodes/${this.node}/qemu/${vmid}/status/current`);
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching VM ${vmid} status:`, error.message);
      throw new Error(`Failed to fetch VM status: ${error.message}`);
    }
  }

  async startVM(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.post(`/api2/json/nodes/${this.node}/qemu/${vmid}/status/start`);
      return response.data.data;
    } catch (error) {
      console.error(`Error starting VM ${vmid}:`, error.message);
      throw new Error(`Failed to start VM: ${error.message}`);
    }
  }

  async stopVM(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.post(`/api2/json/nodes/${this.node}/qemu/${vmid}/status/stop`);
      return response.data.data;
    } catch (error) {
      console.error(`Error stopping VM ${vmid}:`, error.message);
      throw new Error(`Failed to stop VM: ${error.message}`);
    }
  }

  async shutdownVM(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.post(`/api2/json/nodes/${this.node}/qemu/${vmid}/status/shutdown`);
      return response.data.data;
    } catch (error) {
      console.error(`Error shutting down VM ${vmid}:`, error.message);
      throw new Error(`Failed to shutdown VM: ${error.message}`);
    }
  }

  async rebootVM(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.post(`/api2/json/nodes/${this.node}/qemu/${vmid}/status/reboot`);
      return response.data.data;
    } catch (error) {
      console.error(`Error rebooting VM ${vmid}:`, error.message);
      throw new Error(`Failed to reboot VM: ${error.message}`);
    }
  }

  async getVMConfig(vmid) {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.get(`/api2/json/nodes/${this.node}/qemu/${vmid}/config`);
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching VM ${vmid} config:`, error.message);
      throw new Error(`Failed to fetch VM config: ${error.message}`);
    }
  }

  async getNodeStatus() {
    await this.ensureAuthenticated();
    try {
      const response = await this.client.get(`/api2/json/nodes/${this.node}/status`);
      return response.data.data;
    } catch (error) {
      console.error(`Error fetching node status:`, error.message);
      throw new Error(`Failed to fetch node status: ${error.message}`);
    }
  }

  async getNodeInfo() {
    await this.ensureAuthenticated();
    try {
      // Get both status and version info
      const [statusResponse, versionResponse] = await Promise.all([
        this.client.get(`/api2/json/nodes/${this.node}/status`),
        this.client.get(`/api2/json/version`)
      ]);

      const status = statusResponse.data.data;
      const version = versionResponse.data.data;

      return {
        node: this.node,
        status: status.pveversion ? 'online' : 'unknown',
        
        // CPU info
        cpu: {
          usage: status.cpu ? Math.round(status.cpu * 100) : 0,
          cores: status.cpuinfo ? status.cpuinfo.cpus : 'N/A'
        },

        // Memory info (convert from bytes to GB)
        memory: {
          used: status.memory ? Math.round(status.memory.used / 1024 / 1024 / 1024 * 100) / 100 : 0,
          total: status.memory ? Math.round(status.memory.total / 1024 / 1024 / 1024 * 100) / 100 : 0,
          usage: status.memory ? Math.round((status.memory.used / status.memory.total) * 100) : 0
        },

        // Uptime (convert seconds to human readable)
        uptime: status.uptime ? this.formatUptime(status.uptime) : 'Unknown',
        uptimeSeconds: status.uptime || 0,

        // IO delay and load average
        iowait: status.wait ? Math.round(status.wait * 100) / 100 : 0,
        loadavg: status.loadavg ? status.loadavg : [0, 0, 0],

        // Additional info
        pveVersion: status.pveversion || 'Unknown',
        kernelVersion: status.kversion || 'Unknown'
      };
    } catch (error) {
      console.error(`Error fetching node info:`, error.message);
      throw new Error(`Failed to fetch node info: ${error.message}`);
    }
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  // VM Creation and Cloning Methods
  async cloneVM(sourceVmid, newVmid, vmName, options = {}) {
    await this.ensureAuthenticated();
    try {
      const cloneParams = {
        newid: newVmid,
        name: vmName,
        full: options.fullClone ? 1 : 0, // 0 for linked clone, 1 for full clone
        target: this.node,
        ...options
      };

      console.log(`Creating ${options.fullClone ? 'full' : 'linked'} clone of VM ${sourceVmid} -> ${newVmid} (${vmName})`);
      
      const response = await this.client.post(
        `/api2/json/nodes/${this.node}/qemu/${sourceVmid}/clone`,
        cloneParams
      );
      
      return response.data.data;
    } catch (error) {
      console.error(`Error cloning VM ${sourceVmid} to ${newVmid}:`, error.message);
      throw new Error(`Failed to clone VM: ${error.message}`);
    }
  }

  async updateVMConfig(vmid, config) {
    await this.ensureAuthenticated();
    try {
      console.log(`Updating VM ${vmid} configuration:`, config);
      
      const response = await this.client.put(
        `/api2/json/nodes/${this.node}/qemu/${vmid}/config`,
        config
      );
      
      return response.data.data;
    } catch (error) {
      console.error(`Error updating VM ${vmid} config:`, error.message);
      throw new Error(`Failed to update VM config: ${error.message}`);
    }
  }

  async getNextAvailableVMID(startRange = 3001, endRange = 3999) {
    await this.ensureAuthenticated();
    try {
      const vms = await this.getVMs();
      const usedIds = new Set(vms.map(vm => vm.vmid));
      
      for (let vmid = startRange; vmid <= endRange; vmid++) {
        if (!usedIds.has(vmid)) {
          return vmid;
        }
      }
      
      throw new Error(`No available VM IDs in range ${startRange}-${endRange}`);
    } catch (error) {
      console.error('Error finding next available VM ID:', error.message);
      throw error;
    }
  }

  async waitForTask(taskId, timeout = 300000) {
    await this.ensureAuthenticated();
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await this.client.get(`/api2/json/nodes/${this.node}/tasks/${taskId}/status`);
        const task = response.data.data;
        
        if (task.status === 'stopped') {
          if (task.exitstatus === 'OK') {
            return { success: true, task };
          } else {
            throw new Error(`Task failed: ${task.exitstatus}`);
          }
        }
        
        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error checking task ${taskId}:`, error.message);
        throw error;
      }
    }
    
    throw new Error(`Task ${taskId} timeout after ${timeout/1000} seconds`);
  }

  async createVMFromTemplate(templateVmid, userAccountId, vmNumber, planType, vmCount) {
    try {
      console.log(`Creating VM for user ${userAccountId}, VM #${vmNumber}, plan: ${planType}`);
      
      // Get next available VM ID
      const newVmid = await this.getNextAvailableVMID();
      
      // Generate VM name based on user account ID and VM number
      const vmName = `${userAccountId}-${String(vmNumber).padStart(2, '0')}`;
      
      console.log(`Cloning template ${templateVmid} to VM ${newVmid} (${vmName})`);
      
      // Create linked clone
      const cloneTask = await this.cloneVM(templateVmid, newVmid, vmName, {
        fullClone: false, // linked clone
        description: `Auto-created VM for user ${userAccountId} - Plan: ${planType}`
      });
      
      // Wait for clone operation to complete
      await this.waitForTask(cloneTask);
      console.log(`Clone operation completed for VM ${newVmid}`);
      
      // Configure VM based on plan type
      const vmConfig = this.getVMConfigForPlan(planType);
      if (vmConfig && Object.keys(vmConfig).length > 0) {
        console.log(`Applying plan-specific configuration for ${planType}:`, vmConfig);
        await this.updateVMConfig(newVmid, vmConfig);
      }
      
      // Start the VM
      console.log(`Starting VM ${newVmid}`);
      await this.startVM(newVmid);
      
      console.log(`Successfully created and started VM ${newVmid} (${vmName}) for user ${userAccountId}`);
      
      return {
        vmid: newVmid,
        name: vmName,
        status: 'created',
        planType: planType,
        config: vmConfig
      };
      
    } catch (error) {
      console.error(`Error creating VM from template for user ${userAccountId}:`, error.message);
      throw error;
    }
  }

  getVMConfigForPlan(planType) {
    const configs = {
      'hour_booster': {
        cores: 2,
        memory: 4096,
        description: 'Hour Booster Plan - 2 vCPUs, 4GB RAM'
      },
      'dual_mode': {
        cores: 2,
        memory: 4096,
        description: 'Dual Mode Plan - 2 vCPUs, 4GB RAM'
      },
      'kd_drop': {
        cores: 4,
        memory: 8192,
        description: 'KD Drop Plan - 4 vCPUs, 8GB RAM'
      }
    };
    
    return configs[planType] || {};
  }

  async uploadFileToVM(vmid, localFilePath, remoteFilePath) {
    // This would require additional setup with file transfer methods
    // For now, we'll create a placeholder that logs the intended action
    console.log(`TODO: Upload file ${localFilePath} to VM ${vmid} at ${remoteFilePath}`);
    
    // In a real implementation, this might use:
    // - Proxmox guest agent file transfer
    // - SCP/SFTP if network access is available
    // - Shared storage mounting
    // - CD-ROM ISO with files
    
    return { success: true, message: 'File upload queued' };
  }

  async executeCommandOnVM(vmid, command) {
    await this.ensureAuthenticated();
    try {
      // This requires Proxmox guest agent to be installed on the VM
      const response = await this.client.post(
        `/api2/json/nodes/${this.node}/qemu/${vmid}/agent/exec`,
        {
          command: Array.isArray(command) ? command : [command]
        }
      );
      
      return response.data.data;
    } catch (error) {
      console.error(`Error executing command on VM ${vmid}:`, error.message);
      throw new Error(`Failed to execute command on VM: ${error.message}`);
    }
  }
}

module.exports = new ProxmoxService(); 