const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const proxmoxService = require('../services/proxmox');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const profile = await db.getUserProfile(userId);
    
    if (profile) {
      res.json({ profile });
    } else {
      res.status(404).json({ error: 'Profile not found' });
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user dashboard stats
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await db.findUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get real VM count from Proxmox
    let totalVMs = 0;
    try {
      const allVMs = await proxmoxService.getVMs();
      const realVMs = allVMs.filter(vm => vm.template !== 1);
      
      if (user.role === 'admin') {
        totalVMs = realVMs.length;
      } else {
        const userVMIds = db.getUserVMIds(userId);
        totalVMs = realVMs.filter(vm => userVMIds.includes(vm.vmid)).length;
      }
    } catch (error) {
      console.error('Error fetching VMs for dashboard:', error);
      // Fallback to database count if Proxmox is unavailable
      totalVMs = user.vmIds ? user.vmIds.length : 0;
    }

    // Use standardized subscription data (same as payment/subscription-status)
    let subscriptionData = user.subscription || { plan: 'none', expiresAt: null };
    
    // Ensure subscription has correct format for frontend
    if (!subscriptionData.plan || subscriptionData.plan === '') {
      subscriptionData.plan = 'none';
    }

    const stats = {
      totalVMs,
      subscription: subscriptionData,
      accountCreated: user.createdAt,
      lastLogin: user.lastLogin || new Date().toISOString(),
      role: user.role || 'customer'
    };

    res.json({
      stats,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role || 'customer'
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Update user profile
router.post('/profile/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email, username } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Validation
    if (!email || !email.trim()) {
      return res.status(400).json({ field: 'email', error: 'Email is required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ field: 'email', error: 'Please enter a valid email address' });
    }
    
    if (!username || !username.trim()) {
      return res.status(400).json({ field: 'username', error: 'Username is required' });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ field: 'username', error: 'Username must be at least 3 characters' });
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ field: 'username', error: 'Username can only contain letters, numbers, hyphens, and underscores' });
    }

    // Check if email is already taken by another user
    const existingEmailUser = await db.findUserByEmail(email);
    if (existingEmailUser && existingEmailUser.id !== userId) {
      return res.status(409).json({ field: 'email', error: 'Email address is already in use by another account' });
    }

    // Check if username is already taken by another user
    const existingUsernameUser = await db.findUserByUsername(username);
    if (existingUsernameUser && existingUsernameUser.id !== userId) {
      return res.status(409).json({ field: 'username', error: 'Username is already taken by another user' });
    }

    // Update user profile
    const updateData = {
      email,
      username
    };

    const result = await db.updateUserProfile(userId, updateData);
    
    if (result) {
      // Log the action
      db.logAction(userId, 'profile_updated', 'profile', userId, { 
        fields: Object.keys(updateData),
        updatedBy: req.user.username 
      }, clientIP);

      res.json({ 
        message: 'Profile updated successfully',
        updated: updateData
      });
    } else {
      res.status(500).json({ error: 'Failed to update profile' });
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    
    // Handle specific database errors
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('username')) {
        return res.status(409).json({ field: 'username', error: 'Username is already taken' });
      }
      if (error.message.includes('email')) {
        return res.status(409).json({ field: 'email', error: 'Email address is already in use' });
      }
    }
    
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
router.post('/password/change', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    console.log(`Password change attempt for user ID: ${userId}`);

    // Validation
    if (!currentPassword) {
      return res.status(400).json({ field: 'currentPassword', error: 'Current password is required' });
    }
    
    if (!newPassword) {
      return res.status(400).json({ field: 'newPassword', error: 'New password is required' });
    }
    
    // Validate password strength
    if (newPassword.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({ 
        field: 'newPassword', 
        error: 'Password must be at least 8 characters with uppercase, lowercase, and number' 
      });
    }

    // Get current user with password
    const user = await db.findUserByIdForAuth(userId);
    if (!user) {
      console.log(`User not found for password change: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Verifying current password for user: ${user.username}`);
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    console.log(`Current password verification result: ${isCurrentPasswordValid}`);
    
    if (!isCurrentPasswordValid) {
      console.log(`Invalid current password for user: ${user.username}`);
      return res.status(400).json({ field: 'currentPassword', error: 'Current password is incorrect' });
    }

    console.log(`Hashing new password for user: ${user.username}`);
    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    console.log(`Updating password in database for user: ${user.username}`);
    // Update password
    const result = await db.updateUserPassword(userId, hashedNewPassword);
    console.log(`Database update result: ${result}`);
    
    if (result) {
      // Log the action
      db.logAction(userId, 'password_changed', 'security', userId, { 
        changedBy: req.user.username 
      }, clientIP);

      console.log(`Password successfully changed for user: ${user.username}`);
      res.json({ message: 'Password changed successfully' });
    } else {
      console.error(`Failed to update password in database for user: ${user.username}`);
      res.status(500).json({ error: 'Failed to change password' });
    }
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update preferences
router.post('/preferences/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { emailNotifications, securityNotifications, marketingEmails, theme, language } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    const preferences = {
      emailNotifications: Boolean(emailNotifications),
      securityNotifications: Boolean(securityNotifications),
      marketingEmails: Boolean(marketingEmails),
      theme: theme || 'light',
      language: language || 'en'
    };

    const result = await db.updateUserPreferences(userId, preferences);
    
    if (result) {
      // Log the action
      db.logAction(userId, 'preferences_updated', 'preferences', userId, { 
        preferences,
        updatedBy: req.user.username 
      }, clientIP);

      res.json({ 
        message: 'Preferences updated successfully',
        preferences
      });
    } else {
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Get user sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = await db.getUserSessions(userId);
    
    // Add current session flag
    const currentTokenHash = crypto.createHash('sha256').update(req.token || '').digest('hex');
    const enhancedSessions = sessions.map(session => ({
      ...session,
      current: session.token_hash === currentTokenHash
    }));

    res.json({ sessions: enhancedSessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Terminate a session
router.delete('/sessions/:sessionId/terminate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Get session details before terminating
    const session = await db.getSessionById(sessionId);
    if (!session || session.user_id !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Prevent terminating current session
    const currentTokenHash = crypto.createHash('sha256').update(req.token || '').digest('hex');
    if (session.token_hash === currentTokenHash) {
      return res.status(400).json({ error: 'Cannot terminate your current session' });
    }

    const result = await db.terminateSession(sessionId);
    
    if (result) {
      // Log the action
      db.logAction(userId, 'session_terminated', 'security', sessionId, { 
        sessionInfo: {
          ip: session.ip_address,
          userAgent: session.user_agent
        },
        terminatedBy: req.user.username 
      }, clientIP);

      res.json({ message: 'Session terminated successfully' });
    } else {
      res.status(500).json({ error: 'Failed to terminate session' });
    }
  } catch (error) {
    console.error('Error terminating session:', error);
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Get login history
router.get('/login-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const history = await db.getUserLoginHistory(userId, 50);
    res.json({ history });
  } catch (error) {
    console.error('Error fetching login history:', error);
    res.status(500).json({ error: 'Failed to fetch login history' });
  }
});

// Export user data
router.get('/data/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Get comprehensive user data
    const userData = await db.exportUserData(userId);
    
    // Log the action
    db.logAction(userId, 'data_exported', 'privacy', userId, { 
      exportedBy: req.user.username 
    }, clientIP);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="account-data-${req.user.username}-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json({
      exportDate: new Date().toISOString(),
      account: userData.account,
      profile: userData.profile,
      preferences: userData.preferences,
      sessions: userData.sessions,
      auditLogs: userData.auditLogs,
      subscriptions: userData.subscriptions,
      vmAssignments: userData.vmAssignments
    });
  } catch (error) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

// Delete account
router.delete('/account/delete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Prevent admin from deleting their own account if they are the only admin
    if (req.user.role === 'admin') {
      const adminCount = await db.getAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin account' });
      }
    }

    // Log the action before deletion
    db.logAction(userId, 'account_deleted', 'account', userId, { 
      deletedBy: req.user.username,
      userRole: req.user.role
    }, clientIP);

    // Delete the user account
    const result = await db.deleteUser(userId);
    
    if (result) {
      res.json({ message: 'Account deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete account' });
    }
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router; 