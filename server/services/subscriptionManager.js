const db = require('./database');
const proxmoxService = require('./proxmox');

class SubscriptionManager {
  constructor() {
    // Check for expired subscriptions every hour
    this.checkInterval = setInterval(() => {
      this.checkExpiredSubscriptions();
    }, 60 * 60 * 1000); // 1 hour
    
    // Run initial check after 5 seconds
    setTimeout(() => {
      this.checkExpiredSubscriptions();
    }, 5000);
  }

  async checkExpiredSubscriptions() {
    try {
      console.log('Checking for expired subscriptions and VM lifecycle management...');
      
      // Get all users with subscriptions that have expired
      const expiredUsers = await this.getExpiredSubscriptionUsers();
      
      // Get all users with no subscription at all
      const noSubscriptionUsers = await this.getUsersWithNoSubscription();
      
      // Get users whose VMs should be destroyed (24+ hours after expiry)
      const vmDestructionUsers = await this.getUsersForVMDestruction();
      
      // Handle VM shutdowns for recently expired subscriptions
      const allInactiveUsers = [...expiredUsers, ...noSubscriptionUsers];
      
      for (const user of allInactiveUsers) {
        console.log(`Processing inactive subscription for user: ${user.username} (${user.id})`);
        await this.handleExpiredSubscription(user);
      }
      
      // Handle VM destruction for users expired 24+ hours
      for (const user of vmDestructionUsers) {
        console.log(`Processing VM destruction for user: ${user.username} (${user.id})`);
        await this.handleVMDestruction(user);
      }
      
      if (allInactiveUsers.length > 0) {
        console.log(`Processed ${allInactiveUsers.length} users with inactive subscriptions`);
      }
      
      if (vmDestructionUsers.length > 0) {
        console.log(`Processed ${vmDestructionUsers.length} users for VM destruction`);
      }
    } catch (error) {
      console.error('Error checking expired subscriptions:', error);
    }
  }

  async getExpiredSubscriptionUsers() {
    try {
      const stmt = db.db.prepare(`
        SELECT id, username, subscription_plan, subscription_expires_at, subscription_data
        FROM users
        WHERE subscription_plan IS NOT NULL 
        AND subscription_plan != 'none'
        AND subscription_expires_at IS NOT NULL
        AND datetime(subscription_expires_at) <= datetime('now')
        AND (
          subscription_data IS NULL 
          OR json_extract(subscription_data, '$.vmsShutdownOnExpiry') IS NULL
          OR json_extract(subscription_data, '$.vmsShutdownOnExpiry') != 1
        )
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('Error getting expired subscription users:', error);
      return [];
    }
  }

  async getUsersWithNoSubscription() {
    try {
      const stmt = db.db.prepare(`
        SELECT id, username, subscription_plan, subscription_expires_at, subscription_data
        FROM users
        WHERE role != 'admin'
        AND (
          subscription_plan IS NULL 
          OR subscription_plan = 'none'
          OR subscription_plan = ''
        )
        AND (
          subscription_data IS NULL 
          OR json_extract(subscription_data, '$.vmsShutdownOnNoSub') IS NULL
          OR json_extract(subscription_data, '$.vmsShutdownOnNoSub') != 1
        )
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('Error getting users with no subscription:', error);
      return [];
    }
  }

  async getUsersForVMDestruction() {
    try {
      const stmt = db.db.prepare(`
        SELECT id, username, subscription_plan, subscription_expires_at, subscription_data
        FROM users
        WHERE role != 'admin'
        AND subscription_plan IS NOT NULL 
        AND subscription_plan != 'none'
        AND subscription_expires_at IS NOT NULL
        AND datetime(subscription_expires_at) <= datetime('now', '-24 hours')
        AND (
          subscription_data IS NULL 
          OR json_extract(subscription_data, '$.vmsDestroyed') IS NULL
          OR json_extract(subscription_data, '$.vmsDestroyed') != 1
        )
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('Error getting users for VM destruction:', error);
      return [];
    }
  }

  async handleExpiredSubscription(user) {
    try {
      // Get all VMs assigned to this user
      const userVMs = db.getUserVMs(user.id);
      console.log(`User ${user.username} has ${userVMs.length} VMs assigned`);
      
      if (userVMs.length === 0) {
        await this.markSubscriptionProcessed(user.id);
        return;
      }

      // Get current status of all VMs from Proxmox
      let shutdownCount = 0;
      for (const vmid of userVMs) {
        try {
          const vmStatus = await proxmoxService.getVMStatus(vmid);
          
          if (vmStatus.status === 'running') {
            const reason = user.subscription_plan === 'none' || !user.subscription_plan ? 
              'no_subscription' : 'subscription_expired';
            
            console.log(`Shutting down VM ${vmid} for user ${user.username} (${reason})`);
            await proxmoxService.shutdownVM(vmid);
            shutdownCount++;
            
            // Log the automatic shutdown
            db.logAction(
              user.id, 
              `vm_auto_shutdown_${reason}`, 
              'vm', 
              vmid.toString(), 
              { 
                reason: reason,
                expiresAt: user.subscription_expires_at,
                plan: user.subscription_plan 
              },
              'system'
            );
          } else {
            console.log(`VM ${vmid} is already stopped`);
          }
        } catch (vmError) {
          console.error(`Error shutting down VM ${vmid} for user ${user.username}:`, vmError);
        }
      }
      
      // Mark this subscription as processed so we don't keep trying to shut down VMs
      await this.markSubscriptionProcessed(user.id);
      
      console.log(`Shut down ${shutdownCount} VMs for user ${user.username}`);
      
    } catch (error) {
      console.error(`Error handling expired subscription for user ${user.username}:`, error);
    }
  }

  async markSubscriptionProcessed(userId) {
    try {
      const user = await db.findUserById(userId);
      let subscriptionData = {};
      
      if (user.subscription_data) {
        try {
          subscriptionData = JSON.parse(user.subscription_data);
        } catch (e) {
          console.error('Error parsing subscription data:', e);
        }
      }
      
      // Mark that VMs have been shut down for this inactive subscription
      const hasSubscription = user.subscription_plan && user.subscription_plan !== 'none';
      
      if (hasSubscription) {
        subscriptionData.vmsShutdownOnExpiry = 1;
        subscriptionData.shutdownTimestamp = new Date().toISOString();
      } else {
        subscriptionData.vmsShutdownOnNoSub = 1;
        subscriptionData.shutdownTimestamp = new Date().toISOString();
      }
      
      const stmt = db.db.prepare(`
        UPDATE users 
        SET subscription_data = ?
        WHERE id = ?
      `);
      
      stmt.run(JSON.stringify(subscriptionData), userId);
      console.log(`Marked subscription as processed for user ${userId}`);
      
    } catch (error) {
      console.error(`Error marking subscription as processed for user ${userId}:`, error);
    }
  }

  // Method to immediately shutdown VMs when subscription becomes inactive
  async shutdownVMsForInactiveSubscription(userId) {
    try {
      const user = await db.findUserById(userId);
      if (!user || user.role === 'admin') {
        return;
      }

      if (this.hasActiveSubscription(user)) {
        return; // Subscription is still active
      }

      console.log(`Immediately shutting down VMs for user ${user.username} due to inactive subscription`);
      
      const userVMs = db.getUserVMs(user.id);
      let shutdownCount = 0;
      
      for (const vmid of userVMs) {
        try {
          const vmStatus = await proxmoxService.getVMStatus(vmid);
          
          if (vmStatus.status === 'running') {
            console.log(`Shutting down VM ${vmid} for user ${user.username} (subscription became inactive)`);
            await proxmoxService.shutdownVM(vmid);
            shutdownCount++;
            
            // Log the immediate shutdown
            db.logAction(
              user.id,
              'vm_immediate_shutdown_subscription_inactive',
              'vm',
              vmid.toString(),
              { reason: 'subscription_became_inactive' },
              'system'
            );
          }
        } catch (vmError) {
          console.error(`Error shutting down VM ${vmid}:`, vmError);
        }
      }
      
      console.log(`Immediately shut down ${shutdownCount} VMs for user ${user.username}`);
      
    } catch (error) {
      console.error(`Error in immediate VM shutdown for user ${userId}:`, error);
    }
  }

  // Method to check if a specific user has an active subscription
  hasActiveSubscription(user) {
    // Admins always have access regardless of subscription
    if (user.role === 'admin') {
      return true;
    }
    
    if (!user.subscription || user.subscription.plan === 'none') {
      return false;
    }
    
    if (!user.subscription.expiresAt) {
      // No expiration date means it's active (lifetime)
      return true;
    }
    
    const expiryDate = new Date(user.subscription.expiresAt);
    const now = new Date();
    return expiryDate > now;
  }

  async handleVMDestruction(user) {
    try {
      // Get all VMs assigned to this user
      const userVMs = db.getUserVMs(user.id);
      console.log(`User ${user.username} has ${userVMs.length} VMs to be destroyed (expired 24+ hours)`);
      
      if (userVMs.length === 0) {
        await this.markVMsDestroyed(user.id);
        return;
      }

      let destroyedCount = 0;
      const vmProvisioning = require('./vmProvisioning');
      
      for (const vmid of userVMs) {
        try {
          console.log(`Destroying VM ${vmid} for user ${user.username} (subscription expired 24+ hours ago)`);
          
          // Stop the VM first if it's running
          try {
            const vmStatus = await proxmoxService.getVMStatus(vmid);
            if (vmStatus.status === 'running') {
              console.log(`Stopping VM ${vmid} before destruction`);
              await proxmoxService.stopVM(vmid);
              // Wait a bit for the VM to stop
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          } catch (statusError) {
            console.log(`VM ${vmid} status check failed, proceeding with destruction:`, statusError.message);
          }
          
          // Destroy the VM completely
          await proxmoxService.destroyVM(vmid);
          destroyedCount++;
          
          // Remove VM assignment from database
          db.removeVMFromUser(user.id, vmid);
          
          // Log the destruction
          db.logAction(
            user.id, 
            'vm_auto_destroyed', 
            'vm', 
            vmid.toString(), 
            { 
              reason: 'subscription_expired_24h',
              expiresAt: user.subscription_expires_at,
              plan: user.subscription_plan,
              destructionTimestamp: new Date().toISOString()
            },
            'system'
          );
          
          console.log(`Successfully destroyed VM ${vmid} for user ${user.username}`);
          
        } catch (vmError) {
          console.error(`Error destroying VM ${vmid} for user ${user.username}:`, vmError);
          // Log the failed destruction attempt
          db.logAction(
            user.id, 
            'vm_destruction_failed', 
            'vm', 
            vmid.toString(), 
            { 
              reason: 'subscription_expired_24h',
              error: vmError.message,
              attemptTimestamp: new Date().toISOString()
            },
            'system'
          );
        }
      }
      
      // Mark VMs as destroyed
      await this.markVMsDestroyed(user.id);
      
      console.log(`Destroyed ${destroyedCount} VMs for user ${user.username}`);
      
    } catch (error) {
      console.error(`Error handling VM destruction for user ${user.username}:`, error);
    }
  }

  async markVMsDestroyed(userId) {
    try {
      const user = await db.findUserById(userId);
      let subscriptionData = {};
      
      if (user.subscription_data) {
        try {
          subscriptionData = JSON.parse(user.subscription_data);
        } catch (e) {
          console.error('Error parsing subscription data:', e);
        }
      }
      
      // Mark that VMs have been destroyed for this expired subscription
      subscriptionData.vmsDestroyed = 1;
      subscriptionData.destructionTimestamp = new Date().toISOString();
      
      const stmt = db.db.prepare(`
        UPDATE users 
        SET subscription_data = ?
        WHERE id = ?
      `);
      
      stmt.run(JSON.stringify(subscriptionData), userId);
      console.log(`Marked VMs as destroyed for user ${userId}`);
      
    } catch (error) {
      console.error(`Error marking VMs as destroyed for user ${userId}:`, error);
    }
  }

  // Method to handle subscription renewal - clears shutdown flags and allows VM access
  async handleSubscriptionRenewal(userId) {
    try {
      const user = await db.findUserById(userId);
      if (!user) {
        console.error(`User ${userId} not found for subscription renewal`);
        return false;
      }

      // Check if user now has an active subscription
      if (!this.hasActiveSubscription(user)) {
        console.log(`User ${user.username} still doesn't have active subscription, skipping renewal handling`);
        return false;
      }

      console.log(`Processing subscription renewal for user ${user.username}`);

      let subscriptionData = {};
      if (user.subscription_data) {
        try {
          subscriptionData = JSON.parse(user.subscription_data);
        } catch (e) {
          console.error('Error parsing subscription data:', e);
        }
      }

      // Clear shutdown and destruction flags
      const wasShutdown = subscriptionData.vmsShutdownOnExpiry || subscriptionData.vmsShutdownOnNoSub;
      const wasDestroyed = subscriptionData.vmsDestroyed;

      if (wasShutdown || wasDestroyed) {
        // Clear the flags
        delete subscriptionData.vmsShutdownOnExpiry;
        delete subscriptionData.vmsShutdownOnNoSub;
        delete subscriptionData.vmsDestroyed;
        delete subscriptionData.shutdownTimestamp;
        delete subscriptionData.destructionTimestamp;
        
        // Add renewal timestamp
        subscriptionData.renewalTimestamp = new Date().toISOString();
        subscriptionData.vmAccessRestored = true;

        // Update the database
        const stmt = db.db.prepare(`
          UPDATE users 
          SET subscription_data = ?
          WHERE id = ?
        `);
        
        stmt.run(JSON.stringify(subscriptionData), userId);

        // Log the renewal
        db.logAction(
          userId,
          'subscription_renewed_vm_access_restored',
          'subscription',
          user.subscription.plan,
          {
            wasShutdown,
            wasDestroyed,
            renewalTimestamp: subscriptionData.renewalTimestamp
          },
          'system'
        );

        console.log(`Subscription renewal processed for user ${user.username}. VM access restored. VMs were ${wasDestroyed ? 'destroyed' : 'shutdown'}`);
        
        // If VMs were destroyed, they'll need to be re-provisioned
        if (wasDestroyed) {
          console.log(`User ${user.username} had VMs destroyed. New VMs will be provisioned by webhook handler.`);
        }

        return true;
      } else {
        console.log(`User ${user.username} subscription renewal: no VM restrictions to clear`);
        return false;
      }

    } catch (error) {
      console.error(`Error handling subscription renewal for user ${userId}:`, error);
      return false;
    }
  }

  // Cleanup method
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

module.exports = new SubscriptionManager(); 