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
      console.log('Checking for expired subscriptions and users with no subscription...');
      
      // Get all users with subscriptions that have expired
      const expiredUsers = await this.getExpiredSubscriptionUsers();
      
      // Get all users with no subscription at all
      const noSubscriptionUsers = await this.getUsersWithNoSubscription();
      
      // Combine both lists
      const allInactiveUsers = [...expiredUsers, ...noSubscriptionUsers];
      
      for (const user of allInactiveUsers) {
        console.log(`Processing inactive subscription for user: ${user.username} (${user.id})`);
        await this.handleExpiredSubscription(user);
      }
      
      if (allInactiveUsers.length > 0) {
        console.log(`Processed ${allInactiveUsers.length} users with inactive subscriptions`);
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
    if (!user.subscription || user.subscription.plan === 'none') {
      return false;
    }
    
    if (!user.subscription.expiresAt) {
      // No expiration date means it's active (lifetime or admin)
      return true;
    }
    
    const expiryDate = new Date(user.subscription.expiresAt);
    const now = new Date();
    return expiryDate > now;
  }

  // Cleanup method
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }
}

module.exports = new SubscriptionManager(); 