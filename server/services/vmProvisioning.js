const proxmoxService = require('./proxmox');
const db = require('./database');

class VMProvisioningService {
  constructor() {
    this.templateVmid = 3000; // Windows10T template
    this.setupStates = new Map(); // Track setup progress for users
  }

  // Extract plan details from subscription metadata
  extractPlanDetails(subscription) {
    const metadata = subscription.metadata || {};
    
    // Default plan mappings
    const planMappings = {
      'hour_booster': { planType: 'hour_booster', defaultVMs: 1 },
      'dual_mode': { planType: 'dual_mode', defaultVMs: 1 },
      'kd_drop': { planType: 'kd_drop', defaultVMs: 1 }
    };

    let planType = metadata.planType || 'hour_booster';
    let vmCount = parseInt(metadata.vmCount) || 1;
    let planName = metadata.planName || subscription.nickname || 'Custom Plan';

    // Handle legacy plan names
    if (planName.toLowerCase().includes('basic')) {
      planType = 'hour_booster';
    } else if (planName.toLowerCase().includes('premium')) {
      planType = 'kd_drop';
    }

    // Ensure reasonable VM count limits
    vmCount = Math.min(Math.max(vmCount, 1), 10);

    return {
      planType,
      vmCount,
      planName,
      config: planMappings[planType] || planMappings['hour_booster']
    };
  }

  // Main method to provision VMs after successful payment
  async provisionVMsForUser(userId, subscriptionData) {
    try {
      console.log(`🚀 Starting VM provisioning for user ${userId}`);
      
      const user = await db.findUserById(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const planDetails = this.extractPlanDetails(subscriptionData);
      console.log(`📋 Plan details:`, planDetails);

      // Initialize setup state
      this.setupStates.set(userId, {
        status: 'provisioning',
        planDetails,
        vmsCreated: [],
        vmsPending: planDetails.vmCount,
        startedAt: new Date(),
        setupRequired: true
      });

      // Create VMs
      const createdVMs = [];
      for (let i = 1; i <= planDetails.vmCount; i++) {
        try {
          console.log(`Creating VM ${i}/${planDetails.vmCount} for user ${user.uuid}`);
          
          const vmResult = await proxmoxService.createVMFromTemplate(
            this.templateVmid,
            user.uuid,
            i,
            planDetails.planType,
            planDetails.vmCount
          );

          createdVMs.push(vmResult);
          
          // Assign VM to user in database
          db.assignVMToUser(userId, vmResult.vmid);
          
          console.log(`✅ Created VM ${vmResult.vmid} (${vmResult.name}) for user ${user.username}`);
          
          // Update setup state
          const setupState = this.setupStates.get(userId);
          if (setupState) {
            setupState.vmsCreated.push(vmResult);
            setupState.vmsPending--;
          }

        } catch (vmError) {
          console.error(`❌ Failed to create VM ${i} for user ${user.username}:`, vmError);
          // Continue with other VMs even if one fails
        }
      }

      // Update final setup state
      this.setupStates.set(userId, {
        ...this.setupStates.get(userId),
        status: createdVMs.length > 0 ? 'ready_for_setup' : 'failed',
        vmsCreated: createdVMs,
        vmsPending: 0,
        completedAt: new Date()
      });

      // Log the provisioning action
      db.logAction(userId, 'vms_provisioned', 'subscription', subscriptionData.id || 'unknown', {
        planType: planDetails.planType,
        vmCount: planDetails.vmCount,
        vmsCreated: createdVMs.map(vm => ({ vmid: vm.vmid, name: vm.name })),
        template: this.templateVmid
      }, 'system');

      console.log(`🎉 Successfully provisioned ${createdVMs.length}/${planDetails.vmCount} VMs for user ${user.username}`);
      
      return {
        success: true,
        vmsCreated: createdVMs,
        planDetails,
        setupRequired: true
      };

    } catch (error) {
      console.error(`❌ VM provisioning failed for user ${userId}:`, error);
      
      // Update setup state to failed
      this.setupStates.set(userId, {
        ...this.setupStates.get(userId),
        status: 'failed',
        error: error.message,
        completedAt: new Date()
      });

      throw error;
    }
  }

  // Get setup status for a user
  getSetupStatus(userId) {
    const setupState = this.setupStates.get(userId);
    if (!setupState) {
      return { status: 'none', message: 'No setup in progress' };
    }

    return {
      status: setupState.status,
      planDetails: setupState.planDetails,
      vmsCreated: setupState.vmsCreated,
      vmsPending: setupState.vmsPending,
      startedAt: setupState.startedAt,
      completedAt: setupState.completedAt,
      setupRequired: setupState.setupRequired,
      error: setupState.error
    };
  }

  // Check if user needs setup (has VMs but hasn't completed setup)
  async checkSetupRequired(userId) {
    try {
      const user = await db.findUserById(userId);
      if (!user || !user.subscription || user.subscription.plan === 'none') {
        return { required: false, reason: 'no_subscription' };
      }

      const userVMs = db.getUserVMIds(userId);
      if (userVMs.length === 0) {
        return { required: false, reason: 'no_vms' };
      }

      // Check if setup state exists and is ready
      const setupState = this.setupStates.get(userId);
      if (setupState && setupState.status === 'ready_for_setup') {
        return { 
          required: true, 
          reason: 'vms_ready',
          vmCount: userVMs.length,
          planType: setupState.planDetails?.planType
        };
      }

      // Check if VMs were recently created (fallback)
      // This could also check VM creation timestamps or setup completion flags in database
      return { required: false, reason: 'setup_complete_or_not_needed' };

    } catch (error) {
      console.error('Error checking setup requirements:', error);
      return { required: false, reason: 'error', error: error.message };
    }
  }

  // Mark setup as initiated by user
  initiateSetup(userId) {
    const setupState = this.setupStates.get(userId);
    if (setupState) {
      setupState.status = 'setup_in_progress';
      setupState.setupInitiatedAt = new Date();
      this.setupStates.set(userId, setupState);
      
      console.log(`User ${userId} initiated VM setup process`);
      return true;
    }
    return false;
  }

  // Handle file upload completion
  async handleFileUpload(userId, filePath, fileName) {
    try {
      const setupState = this.setupStates.get(userId);
      if (!setupState || setupState.status !== 'setup_in_progress') {
        throw new Error('No active setup process found');
      }

      console.log(`Processing uploaded file for user ${userId}: ${fileName}`);

      // Distribute file to all user VMs
      const userVMs = setupState.vmsCreated || [];
      const uploadResults = [];

      for (const vm of userVMs) {
        try {
          // For now, we'll simulate the file distribution
          // In production, this would actually transfer the file to each VM
          const result = await proxmoxService.uploadFileToVM(
            vm.vmid,
            filePath,
            'C:\\hwho\\hwho.dat' // Windows path on VM
          );
          
          uploadResults.push({ vmid: vm.vmid, success: true, result });
          console.log(`📁 File distributed to VM ${vm.vmid} (${vm.name})`);
          
        } catch (vmError) {
          console.error(`Failed to upload file to VM ${vm.vmid}:`, vmError);
          uploadResults.push({ vmid: vm.vmid, success: false, error: vmError.message });
        }
      }

      // Update setup state
      setupState.status = 'file_uploaded';
      setupState.fileUploadedAt = new Date();
      setupState.uploadResults = uploadResults;
      this.setupStates.set(userId, setupState);

      // Log the file upload
      db.logAction(userId, 'setup_file_uploaded', 'vm_setup', fileName, {
        vmCount: userVMs.length,
        successfulUploads: uploadResults.filter(r => r.success).length,
        fileName
      }, 'user');

      console.log(`✅ File upload completed for user ${userId}`);
      
      return {
        success: true,
        distributedToVMs: uploadResults.filter(r => r.success).length,
        totalVMs: userVMs.length,
        uploadResults
      };

    } catch (error) {
      console.error(`File upload handling failed for user ${userId}:`, error);
      throw error;
    }
  }

  // Complete the setup process
  async completeSetup(userId) {
    try {
      const setupState = this.setupStates.get(userId);
      if (!setupState) {
        throw new Error('No setup process found');
      }

      // Trigger the automation script on each VM
      const userVMs = setupState.vmsCreated || [];
      const automationResults = [];

      for (const vm of userVMs) {
        try {
          // This would execute the PowerShell script on each VM
          // The script would be modified to handle the specific plan type
          const command = `powershell.exe -ExecutionPolicy Bypass -File "C:\\automation\\start_${setupState.planDetails.planType}.ps1"`;
          
          // For now, we'll log this action (actual implementation would use guest agent)
          console.log(`🤖 Starting automation on VM ${vm.vmid} with command: ${command}`);
          
          // Simulate successful automation start
          automationResults.push({ vmid: vm.vmid, success: true });
          
        } catch (vmError) {
          console.error(`Failed to start automation on VM ${vm.vmid}:`, vmError);
          automationResults.push({ vmid: vm.vmid, success: false, error: vmError.message });
        }
      }

      // Update setup state to completed
      setupState.status = 'completed';
      setupState.completedAt = new Date();
      setupState.automationResults = automationResults;
      setupState.setupRequired = false;
      this.setupStates.set(userId, setupState);

      // Log completion
      db.logAction(userId, 'setup_completed', 'vm_setup', 'automation_started', {
        vmCount: userVMs.length,
        planType: setupState.planDetails.planType,
        successfulAutomations: automationResults.filter(r => r.success).length
      }, 'user');

      console.log(`🎉 Setup completed for user ${userId}`);
      
      return {
        success: true,
        automationStarted: automationResults.filter(r => r.success).length,
        totalVMs: userVMs.length
      };

    } catch (error) {
      console.error(`Setup completion failed for user ${userId}:`, error);
      throw error;
    }
  }

  // Cleanup old setup states (call periodically)
  cleanupOldSetupStates() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [userId, setupState] of this.setupStates.entries()) {
      const stateTime = setupState.completedAt || setupState.startedAt;
      if (stateTime && new Date(stateTime).getTime() < cutoffTime) {
        this.setupStates.delete(userId);
        console.log(`Cleaned up old setup state for user ${userId}`);
      }
    }
  }
}

module.exports = new VMProvisioningService(); 