const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const vmProvisioning = require('../services/vmProvisioning');

// Initialize Stripe
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const router = express.Router();

// Middleware to ensure admin access
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get all users (admin only)
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    
    // Remove sensitive data
    const safeUsers = users.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user (admin only)
router.post('/users/create', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, role = 'customer', vmIds = [], subscriptionPlan, subscriptionDuration, subscriptionDurationType } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check for existing username
    const existingUsername = await db.findUserByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ 
        error: 'Username already exists. Please choose a different username.',
        type: 'duplicate_username'
      });
    }

    // Check for existing email
    const existingEmail = await db.findUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ 
        error: 'Email address already exists. Please use a different email.',
        type: 'duplicate_email'
      });
    }

    // Validate role
    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "customer" or "admin"' });
    }

    // Validate VM IDs if provided
    if (vmIds && vmIds.length > 0) {
      const invalidVMs = vmIds.filter(id => !Number.isInteger(id) || id <= 0);
      if (invalidVMs.length > 0) {
        return res.status(400).json({ error: 'Invalid VM IDs provided' });
      }
    }

    // Calculate subscription expiry if subscription details provided
    let subscriptionExpiresAt = null;
    if (subscriptionPlan && subscriptionPlan !== 'none' && subscriptionDuration && subscriptionDurationType) {
      const duration = parseInt(subscriptionDuration);
      if (duration > 0) {
        const expiryDate = new Date();
        if (subscriptionDurationType === 'days') expiryDate.setDate(expiryDate.getDate() + duration);
        else if (subscriptionDurationType === 'weeks') expiryDate.setDate(expiryDate.getDate() + (duration * 7));
        else if (subscriptionDurationType === 'months') expiryDate.setMonth(expiryDate.getMonth() + duration);
        else if (subscriptionDurationType === 'years') expiryDate.setFullYear(expiryDate.getFullYear() + duration);
        
        subscriptionExpiresAt = expiryDate.toISOString();
      }
    }

    // Create user data
    const userData = {
      username,
      email,
      password,
      role,
      vmIds: vmIds || [],
      subscriptionPlan: subscriptionPlan && subscriptionPlan !== 'none' ? subscriptionPlan : null,
      subscriptionExpiresAt
    };

    const newUser = await db.createUser(userData);
    
    if (newUser) {
      // Log the action
      db.logAction(newUser.id, 'user_created', 'user', newUser.id, { 
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        subscriptionPlan: subscriptionPlan || 'none',
        subscriptionDuration: subscriptionDuration ? `${subscriptionDuration} ${subscriptionDurationType}` : 'none',
        createdBy: req.user.username 
      }, clientIP, req.user.id);

      // Remove sensitive data from response
      const { password: _, ...safeUser } = newUser;
      
      res.status(201).json({ 
        message: 'User created successfully',
        user: safeUser
      });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  } catch (error) {
    console.error('Error creating user:', error);
    
    if (error.message === 'Username or email already exists') {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// Update user details
router.post('/users/:userId/update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { email, role, username, vmIds } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Validation
    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Validate username if provided
    if (username) {
      if (username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' });
      }

      // Check if username is already taken by another user
      const existingUser = await db.findUserByUsername(username);
      if (existingUser && existingUser.id !== parseInt(userId)) {
        return res.status(409).json({ error: 'Username is already taken by another user' });
      }
    }

    // Validate role
    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "customer" or "admin"' });
    }

    // Validate VM IDs if provided
    if (vmIds && Array.isArray(vmIds)) {
      const invalidVMs = vmIds.filter(id => !Number.isInteger(id) || id <= 0);
      if (invalidVMs.length > 0) {
        return res.status(400).json({ error: 'All VM IDs must be positive integers' });
      }
    }

    // Update user details
    const updateData = { email, role };
    if (username) {
      updateData.username = username;
    }

    const result = await db.updateUser(userId, updateData);
    
    if (result) {
      // Update VM assignments if provided
      if (vmIds && Array.isArray(vmIds)) {
        await db.updateUserVMAssignments(userId, vmIds);
      }

      // Log the action
      db.logAction(req.user.id, 'user_updated', 'user', userId, {
        fields: Object.keys(updateData),
        updatedBy: req.user.username 
      }, clientIP, req.user.id);

      res.json({ 
        message: 'User updated successfully',
        updated: {
          email,
          role,
          username: username || 'unchanged',
          vmAssignments: vmIds ? vmIds.length : 'unchanged'
        }
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user:', error);
    
    // Handle specific database errors
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      if (error.message.includes('username')) {
        return res.status(409).json({ error: 'Username is already taken' });
      }
      if (error.message.includes('email')) {
        return res.status(409).json({ error: 'Email address is already in use' });
      }
    }
    
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Suspend/Activate user
router.post('/users/:userId/suspend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    const result = await db.updateUserStatusTo(userId, 'suspended');
    
    if (result) {
      db.logAction(req.user.id, 'user_suspended', 'user', userId, {
        suspendedBy: req.user.username,
        reason: 'Admin action'
      }, clientIP, req.user.id);

      res.json({ message: 'User suspended successfully' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error suspending user:', error);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

router.post('/users/:userId/activate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    const result = await db.updateUserStatusTo(userId, 'active');
    
    if (result) {
      db.logAction(req.user.id, 'user_activated', 'user', userId, {
        activatedBy: req.user.username,
        reason: 'Admin action'
      }, clientIP, req.user.id);

      res.json({ message: 'User activated successfully' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

// Ban user
router.post('/users/:userId/ban', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Prevent admin from banning themselves
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot ban your own account' });
    }

    const result = await db.updateUserStatusTo(userId, 'banned');
    
    if (result) {
      db.logAction(req.user.id, 'user_banned', 'user', userId, {
        bannedBy: req.user.username,
        reason: 'Admin action'
      }, clientIP, req.user.id);

      res.json({ message: 'User banned successfully' });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// Reset user password
router.post('/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Generate new random password
    const newPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const result = await db.updateUserPassword(userId, hashedPassword);
    
    if (result) {
      db.logAction(req.user.id, 'password_reset', 'user', userId, {
        resetBy: req.user.username,
        newPassword: newPassword
      }, clientIP, req.user.id);

      res.json({ 
        message: 'Password reset successfully',
        newPassword: newPassword // In production, send this via email instead
      });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.post('/users/:userId/delete', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    // Prevent admin from deleting themselves
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await db.deleteUser(userId);
    
    if (result) {
      db.logAction(req.user.id, 'user_deleted', 'user', userId, {
        deletedBy: req.user.username
      }, clientIP, req.user.id);

      res.json({ message: 'User deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete user' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Send email to user (placeholder)
router.post('/users/:userId/send-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // TODO: Implement actual email sending
    console.log(`📧 Admin ${req.user.username} requested to send email to ${user.email}`);

    db.logAction(req.user.id, 'email_sent', 'user', userId, {
      subject,
      message: message.substring(0, 100) + '...',
      sentBy: req.user.username
    }, clientIP, req.user.id);

    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Get user audit logs
router.get('/users/:userId/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const logs = await db.getUserAuditLogs(userId);
    res.json({ logs });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Get system stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await db.getSystemStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});

// Get comprehensive analytics
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const analytics = await db.getAnalytics();
    res.json({ analytics });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get user activity metrics
router.get('/users/:userId/activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const metrics = await db.getUserActivityMetrics(userId);
    res.json({ metrics });
  } catch (error) {
    console.error('Error fetching user activity metrics:', error);
    res.status(500).json({ error: 'Failed to fetch user activity metrics' });
  }
});

// Get audit logs with pagination and filtering
router.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      action, 
      resource_type, 
      user_id,
      start_date,
      end_date 
    } = req.query;

    let query = `
      SELECT al.*, 
             u.username as target_username, 
             u.uuid as target_user_uuid,
             p.username as performed_by_username, 
             p.uuid as performed_by_uuid
      FROM audit_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      LEFT JOIN users p ON al.performed_by_user_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (action) {
      query += ' AND al.action = ?';
      params.push(action);
    }

    if (resource_type) {
      query += ' AND al.resource_type = ?';
      params.push(resource_type);
    }

    if (user_id) {
      query += ' AND al.user_id = ?';
      params.push(user_id);
    }

    if (start_date) {
      query += ' AND al.created_at >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND al.created_at <= ?';
      params.push(end_date);
    }

    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const stmt = db.db.prepare(query);
    const logs = stmt.all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM audit_logs al WHERE 1=1';
    const countParams = [];

    if (action) {
      countQuery += ' AND action = ?';
      countParams.push(action);
    }

    if (resource_type) {
      countQuery += ' AND resource_type = ?';
      countParams.push(resource_type);
    }

    if (user_id) {
      countQuery += ' AND user_id = ?';
      countParams.push(user_id);
    }

    if (start_date) {
      countQuery += ' AND created_at >= ?';
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ' AND created_at <= ?';
      countParams.push(end_date);
    }

    const countStmt = db.db.prepare(countQuery);
    const { total } = countStmt.get(...countParams);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Assign subscription to user (admin only)
router.post('/users/:userId/assign-subscription', authenticateToken, requireAdmin, async (req, res) => {
  console.log('Admin subscription assignment started');
  console.log('Admin user:', req.user.username);
  console.log('Request data:', req.body);
  
  try {
    const { userId } = req.params;
    const { plan, duration, durationType } = req.body; // plan: 'Hour Booster'/'KD Drop'/'Dual Mode', duration: number, durationType: 'days'/'weeks'/'months'/'years'
    const clientIP = req.ip || req.connection.remoteAddress;

    console.log(`Assigning ${plan} subscription for ${duration} ${durationType} to user ${userId}`);

    // Validation
    if (!plan || !['Hour Booster', 'KD Drop', 'Dual Mode'].includes(plan)) {
      console.log('Invalid plan:', plan);
      return res.status(400).json({ error: 'Invalid plan. Must be "Hour Booster", "KD Drop", or "Dual Mode"' });
    }

    if (!duration || !Number.isInteger(duration) || duration <= 0) {
      console.log('Invalid duration:', duration);
      return res.status(400).json({ error: 'Duration must be a positive integer' });
    }

    if (!durationType || !['days', 'weeks', 'months', 'years'].includes(durationType)) {
      console.log('Invalid duration type:', durationType);
      return res.status(400).json({ error: 'Duration type must be "days", "weeks", "months", or "years"' });
    }

    // Check database health before proceeding
    if (!db.isHealthy()) {
      console.error('Database health check failed before subscription assignment');
      return res.status(503).json({ error: 'Database service unavailable. Please try again in a moment.' });
    }

    // Check if user exists
    const user = await db.findUserById(userId);
    if (!user) {
      console.log('User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Target user found:', user.username, 'current subscription:', user.subscription);

    // Prevent admin from assigning subscription to themselves
    if (parseInt(userId) === req.user.id) {
      console.log('Admin attempting self-assignment');
      return res.status(400).json({ error: 'Cannot assign subscription to your own account' });
    }

    // Calculate expiry date
    const now = new Date();
    let expiryDate = new Date(now);

    console.log('Calculating expiry date from:', now.toISOString());

    switch (durationType) {
      case 'days':
        expiryDate.setDate(now.getDate() + duration);
        break;
      case 'weeks':
        expiryDate.setDate(now.getDate() + (duration * 7));
        break;
      case 'months':
        expiryDate.setMonth(now.getMonth() + duration);
        break;
      case 'years':
        expiryDate.setFullYear(now.getFullYear() + duration);
        break;
    }

    console.log('Calculated expiry date:', expiryDate.toISOString());

    // Update user subscription with proper error handling
    const subscriptionData = {
      plan: plan,
      status: 'active',
      expiresAt: expiryDate
    };

    console.log('Calling updateUserSubscription with:', subscriptionData);

    let subscriptionUpdateResult;
    try {
      subscriptionUpdateResult = await db.updateUserSubscription(userId, subscriptionData);
      console.log('Subscription update result:', subscriptionUpdateResult);
    } catch (dbError) {
      console.error('Database error during subscription update:', dbError);
      
      // Check if database is still healthy
      const isHealthyAfterError = db.isHealthy();
      console.log('Database health after error:', isHealthyAfterError);
      
      return res.status(500).json({ 
        error: 'Failed to update subscription due to database error. Please try again.', 
        details: isHealthyAfterError ? 'Database is healthy' : 'Database may need attention'
      });
    }

    if (subscriptionUpdateResult) {
      // Log the action
      try {
        db.logAction(req.user.id, 'subscription_assigned', 'subscription', plan, {
          assignedTo: user.username,
          assignedBy: req.user.username,
          duration: `${duration} ${durationType}`,
          expiresAt: expiryDate.toISOString()
        }, clientIP, req.user.id);

        console.log('Audit log created for subscription assignment');
      } catch (logError) {
        console.error('Failed to log subscription assignment:', logError);
        // Continue - don't fail the operation for logging issues
      }

      // Trigger VM provisioning for manual subscription assignment
      let provisioningMessage = '';
      try {
        console.log('Triggering VM provisioning for manual subscription assignment...');
        
        // Determine plan type and VM count
        let planType = 'hour_booster';
        let vmCount = 1;
        
        if (plan.toLowerCase().includes('booster')) {
          planType = 'hour_booster';
          vmCount = 1;
        } else if (plan.toLowerCase().includes('dual')) {
          planType = 'dual_mode';
          vmCount = 1;
        } else if (plan.toLowerCase().includes('kd') || plan.toLowerCase().includes('drop')) {
          planType = 'kd_drop';
          vmCount = 1;
        }

        const vmProvisioning = require('../services/vmProvisioning');
        const provisioningResult = await vmProvisioning.provisionVMsForUser(userId, {
          id: `admin-manual-${Date.now()}`,
          metadata: {
            planType: planType,
            vmCount: vmCount.toString(),
            planName: plan
          },
          planType: planType,
          vmCount: vmCount,
          planName: plan,
          nickname: plan
        });

        console.log('VM provisioning completed for manual assignment:', provisioningResult);
        provisioningMessage = ` VMs provisioned: ${provisioningResult.vmsCreated?.length || 0}`;

        // Log VM provisioning success
        try {
          db.logAction(userId, 'vm_provisioning_admin_manual', 'subscription', plan, {
            vmsCreated: provisioningResult.vmsCreated || [],
            planType: planType,
            vmCount: vmCount,
            triggeredBy: req.user.username,
            provisioningResult: provisioningResult
          }, clientIP, req.user.id);
        } catch (logError) {
          console.error('Failed to log VM provisioning success:', logError);
        }

      } catch (provisioningError) {
        console.error('VM provisioning failed for manual subscription:', provisioningError);
        provisioningMessage = ' (VM provisioning failed - please provision manually)';
        
        // Log VM provisioning failure but don't fail the subscription assignment
        try {
          db.logAction(userId, 'vm_provisioning_failed', 'subscription', plan, {
            error: provisioningError.message,
            planType: planType || 'unknown',
            vmCount: vmCount || 1,
            triggeredBy: req.user.username
          }, clientIP, req.user.id);
        } catch (logError) {
          console.error('Failed to log VM provisioning failure:', logError);
        }
      }

      // Fetch updated user to verify - with error handling
      let updatedUser = null;
      try {
        updatedUser = await db.findUserById(userId);
        console.log('Post-assignment verification:', updatedUser?.subscription);
      } catch (verifyError) {
        console.error('Failed to verify user update:', verifyError);
      }

      res.json({
        message: `Subscription assigned successfully${provisioningMessage}`,
        subscription: {
          plan: plan,
          status: 'active',
          expiresAt: expiryDate.toISOString(),
          duration: `${duration} ${durationType}`
        }
      });
    } else {
      console.log('updateUserSubscription returned falsy result');
      res.status(500).json({ error: 'Failed to assign subscription' });
    }
  } catch (error) {
    console.error('Error in assign-subscription route:', error);
    console.error('Error stack:', error.stack);
    
    // Check database health after error
    const isHealthy = db.isHealthy();
    console.log('Database health after route error:', isHealthy);
    
    res.status(500).json({ 
      error: 'Failed to assign subscription',
      details: isHealthy ? 'Internal error' : 'Database connectivity issue'
    });
  }
});

// Get user payment history
router.get('/users/:userId/payment-history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verify user exists
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get payment history
    const payments = await db.getPaymentHistory(userId, parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const refunds = await db.getUserRefunds(userId);

    // Log the action
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(req.user.id, 'payment_history_viewed', 'user', userId, {
      viewedBy: req.user.username,
      recordCount: payments.length
    }, clientIP, req.user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      payments,
      refunds,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: payments.length === parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching user payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Process refund for user payment
router.post('/users/:userId/process-refund', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { paymentId, amount, reason, adminReason } = req.body;
    const adminUserId = req.user.id;

    console.log('🔄 Processing refund request:', {
      userId,
      paymentId,
      amount,
      reason,
      adminReason,
      adminUserId
    });

    if (!stripe) {
      console.log('❌ Stripe not configured');
      return res.status(503).json({ error: 'Payment system not available' });
    }

    // Get the payment details
    const payment = await db.statements.getPaymentById.get(paymentId);
    console.log('📋 Payment details:', payment);

    if (!payment) {
      console.log('❌ Payment not found');
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.user_id !== parseInt(userId)) {
      console.log('❌ Payment does not belong to user');
      return res.status(404).json({ error: 'Payment not found for this user' });
    }

    if (!payment.stripe_payment_intent_id) {
      console.log('❌ No direct payment intent found, checking subscription/invoice...');
      
      // For subscription payments, we need to find the payment intent through the subscription
      if (payment.stripe_subscription_id) {
        console.log('🔍 Looking up subscription:', payment.stripe_subscription_id);
        
        try {
          // Get the subscription
          const subscription = await stripe.subscriptions.retrieve(payment.stripe_subscription_id);
          console.log('📋 Subscription found:', subscription.id);
          
          // Get the latest invoice for this subscription
          const invoices = await stripe.invoices.list({
            subscription: payment.stripe_subscription_id,
            limit: 1
          });
          
          if (invoices.data.length > 0) {
            const invoice = invoices.data[0];
            console.log('📋 Latest invoice found:', invoice.id);
            
            if (invoice.payment_intent) {
              console.log('✅ Found payment intent from invoice:', invoice.payment_intent);
              // Use the payment intent from the invoice
              payment.stripe_payment_intent_id = invoice.payment_intent;
            } else {
              console.log('❌ No payment intent found in invoice');
              return res.status(400).json({ error: 'Cannot process refund: No payment intent found for this subscription payment' });
            }
          } else {
            console.log('❌ No invoices found for subscription');
            return res.status(400).json({ error: 'Cannot process refund: No invoices found for this subscription' });
          }
          
        } catch (stripeError) {
          console.error('❌ Error retrieving subscription/invoice from Stripe:', stripeError);
          return res.status(400).json({ error: 'Cannot process refund: Unable to retrieve subscription details from Stripe' });
        }
        
      } else {
        console.log('❌ No subscription ID either');
        return res.status(400).json({ error: 'Cannot process refund: No payment intent or subscription ID found for this payment' });
      }
    }

    // Check if payment is already refunded
    if (payment.status === 'refunded') {
      console.log('❌ Payment already refunded');
      return res.status(400).json({ error: 'Payment has already been refunded' });
    }

    const refundAmount = amount ? parseInt(parseFloat(amount) * 100) : payment.amount;
    console.log('💰 Refund amount:', refundAmount, 'cents');

    if (refundAmount > payment.amount) {
      console.log('❌ Refund amount exceeds payment amount');
      return res.status(400).json({ error: 'Refund amount cannot exceed payment amount' });
    }

    // Process the refund through Stripe
    console.log('🔄 Creating Stripe refund...');
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: refundAmount,
      reason: reason || 'requested_by_customer',
      metadata: {
        admin_user_id: adminUserId.toString(),
        admin_reason: adminReason || '',
        original_payment_id: paymentId.toString(),
        user_id: userId.toString()
      }
    });

    console.log('✅ Stripe refund created:', refund.id);

    // Record the refund in our database
    await db.recordRefund({
      paymentId,
      userId: payment.user_id,
      stripeRefundId: refund.id,
      stripePaymentIntentId: payment.stripe_payment_intent_id,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      status: refund.status,
      adminUserId,
      adminReason: adminReason || '',
      metadata: { processedBy: req.user.username }
    });

    console.log('✅ Refund recorded in database');

    // Update payment status if fully refunded
    if (refundAmount === payment.amount) {
      await db.updatePaymentStatus(paymentId, 'refunded');
      console.log('✅ Payment status updated to refunded');
    }

    // Log the action
    const clientIP = req.ip || req.connection.remoteAddress;
    db.logAction(userId, 'refund_processed', 'refund', refund.id, {
      amount: refund.amount,
      reason: refund.reason,
      adminReason: adminReason || '',
      processedBy: req.user.username,
      originalPaymentId: paymentId
    }, clientIP, adminUserId);

    console.log('✅ Refund processing completed successfully');

    res.json({
      success: true,
      message: 'Refund processed successfully',
      refund: {
        id: refund.id,
        amount: `$${(refund.amount / 100).toFixed(2)}`,
        status: refund.status,
        stripeRefundId: refund.id
      }
    });

  } catch (error) {
    console.error('❌ Error processing refund:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Handle specific Stripe errors
    if (error.type) {
      switch (error.type) {
        case 'StripeCardError':
          return res.status(400).json({ error: 'Card error: ' + error.message });
        case 'StripeInvalidRequestError':
          return res.status(400).json({ error: 'Invalid request: ' + error.message });
        case 'StripeAPIError':
          return res.status(500).json({ error: 'Stripe API error: ' + error.message });
        case 'StripeConnectionError':
          return res.status(500).json({ error: 'Network error connecting to Stripe' });
        case 'StripeAuthenticationError':
          return res.status(500).json({ error: 'Stripe authentication error' });
        default:
          return res.status(500).json({ error: 'Stripe error: ' + error.message });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process refund: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Provision VMs for users who have subscriptions but no VMs
router.post('/users/:userId/provision-vms', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress;

    console.log(`Admin VM provisioning check for user ${userId}`);
    
    // Get user details
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has active subscription but no VMs
    if (!user.subscription || user.subscription.plan === 'none') {
      return res.status(400).json({ 
        error: 'User has no active subscription',
        subscription: user.subscription
      });
    }

    const userVMs = db.getUserVMIds(userId);
    if (userVMs.length > 0) {
      return res.status(400).json({ 
        error: 'User already has VMs assigned',
        vmIds: userVMs 
      });
    }

    // Extract plan details from subscription
    let planType = 'hour_booster';
    let vmCount = 1;
    
    if (user.subscription.plan.toLowerCase().includes('booster')) {
      planType = 'hour_booster';
    } else if (user.subscription.plan.toLowerCase().includes('dual')) {
      planType = 'dual_mode';
    } else if (user.subscription.plan.toLowerCase().includes('kd') || user.subscription.plan.toLowerCase().includes('drop')) {
      planType = 'kd_drop';
    }

    console.log(`Provisioning VMs for user ${userId} with plan ${user.subscription.plan} (${planType})`);
    
    const result = await vmProvisioning.provisionVMsForUser(userId, {
      id: user.subscription.stripeSubscriptionId || 'admin-provision',
      metadata: {
        planType: planType,
        vmCount: vmCount.toString(),
        planName: user.subscription.plan
      },
      planType: planType,
      vmCount: vmCount,
      planName: user.subscription.plan,
      nickname: user.subscription.plan
    });

    // Log the action
    db.logAction(userId, 'vm_provisioning_admin_manual', 'subscription', user.subscription.stripeSubscriptionId || 'manual', {
      vmsCreated: result.vmsCreated?.length || 0,
      planType: planType,
      vmCount: vmCount,
      triggeredBy: req.user.username
    }, clientIP, req.user.id);

    res.json({
      success: true,
      message: `VM provisioning completed for user ${user.username}`,
      result: result,
      user: {
        id: user.id,
        username: user.username,
        subscription: user.subscription
      }
    });

  } catch (error) {
    console.error('Admin VM provisioning failed:', error);
    res.status(500).json({ 
      error: 'VM provisioning failed', 
      details: error.message 
    });
  }
});

// Debug endpoint to check template VM status
router.get('/debug/template-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const proxmoxService = require('../services/proxmox');
    
    console.log('Checking template VM 3000 status...');
    
    // Check if VM 3000 exists and get its config
    try {
      const templateConfig = await proxmoxService.getVMConfig(3000);
      console.log('Template VM 3000 config:', templateConfig);
      
      // Check if VM 3000 is actually a template
      const isTemplate = templateConfig.template === 1 || templateConfig.template === '1';
      
      // Get VM status
      const vmStatus = await proxmoxService.getVMStatus(3000);
      console.log('Template VM 3000 status:', vmStatus);
      
      res.json({
        success: true,
        template: {
          vmid: 3000,
          exists: true,
          isTemplate: isTemplate,
          name: templateConfig.name,
          status: vmStatus.status,
          config: templateConfig,
          rawStatus: vmStatus
        },
        recommendations: isTemplate ? [] : ['VM 3000 is not configured as a template. Please convert it to a template in Proxmox.']
      });
      
    } catch (vmError) {
      console.error('Template VM 3000 error:', vmError.message);
      
      res.json({
        success: false,
        error: vmError.message,
        template: {
          vmid: 3000,
          exists: false
        },
        recommendations: [
          'VM 3000 (Windows10T) does not exist or is not accessible.',
          'Please create a VM with ID 3000 and configure it as a template.',
          'Make sure the VM is named "Windows10T" and is properly templated.'
        ]
      });
    }
    
  } catch (error) {
    console.error('Error checking template status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check template status',
      details: error.message 
    });
  }
});

// Production monitoring endpoints
router.get('/monitoring/system-health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const proxmoxService = require('../services/proxmox');
    
    // Get system metrics
    const nodeInfo = await proxmoxService.getNodeInfo();
    const vms = await proxmoxService.getVMs();
    
    // Database stats
    const dbStats = await db.getSystemStats();
    
    // Recent activity - focus on operational/technical activities
    const recentLogs = db.db.prepare(`
      SELECT action, resource_type, created_at, COUNT(*) as count
      FROM audit_logs 
      WHERE created_at >= datetime('now', '-24 hours')
      AND (
        action LIKE '%vm%' OR 
        action LIKE '%provisioning%' OR 
        action LIKE '%webhook%' OR
        action LIKE '%system%' OR
        action LIKE '%error%' OR
        action LIKE '%failed%' OR
        action = 'server_overview_accessed' OR
        action = 'monitoring_data_accessed'
      )
      GROUP BY action, resource_type
      ORDER BY created_at DESC
      LIMIT 15
    `).all();
    
    // Error tracking
    const recentErrors = db.db.prepare(`
      SELECT * FROM audit_logs 
      WHERE action LIKE '%failed%' OR action LIKE '%error%'
      AND created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    
    // VM provisioning status
    const provisioningStats = db.db.prepare(`
      SELECT 
        COUNT(*) as total_provisions,
        COUNT(CASE WHEN action = 'vms_provisioned' THEN 1 END) as successful,
        COUNT(CASE WHEN action LIKE '%failed%' THEN 1 END) as failed
      FROM audit_logs 
      WHERE resource_type = 'subscription' 
      AND created_at >= datetime('now', '-7 days')
    `).get();
    
    res.json({
      timestamp: new Date().toISOString(),
      system: {
        proxmox: {
          status: 'online',
          node: nodeInfo.node,
          cpu: nodeInfo.cpu,
          memory: nodeInfo.memory,
          uptime: nodeInfo.uptime,
          loadAvg: nodeInfo.loadavg
        },
        database: {
          users: dbStats.totalUsers,
          activeSubscriptions: dbStats.activeSubscriptions,
          totalVMs: vms.filter(vm => !vm.template).length,
          templates: vms.filter(vm => vm.template).length
        }
      },
      activity: {
        recentActions: recentLogs,
        recentErrors: recentErrors,
        provisioning: provisioningStats
      },
      alerts: [
        ...(nodeInfo.memory.usage > 90 ? [{
          type: 'critical',
          message: `High memory usage: ${nodeInfo.memory.usage}%`,
          component: 'proxmox'
        }] : []),
        ...(nodeInfo.cpu.usage > 80 ? [{
          type: 'warning', 
          message: `High CPU usage: ${nodeInfo.cpu.usage}%`,
          component: 'proxmox'
        }] : []),
        ...(recentErrors.length > 10 ? [{
          type: 'warning',
          message: `${recentErrors.length} errors in last 24 hours`,
          component: 'system'
        }] : [])
      ]
    });
    
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
});

// VM provisioning history
router.get('/monitoring/vm-provisioning', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const provisioningHistory = db.db.prepare(`
      SELECT 
        al.*,
        u.username,
        u.uuid as userAccountId,
        u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.action IN ('vms_provisioned', 'vm_provisioning_failed', 'vm_provisioning_admin_manual')
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset));
    
    // Get failed webhook attempts
    const failedWebhooks = db.db.prepare(`
      SELECT * FROM audit_logs 
      WHERE action = 'webhook_processing_failed'
      AND created_at >= datetime('now', '-7 days')
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    
    res.json({
      provisioningHistory: provisioningHistory.map(log => ({
        ...log,
        details: JSON.parse(log.details || '{}'),
        timestamp: log.created_at
      })),
      failedWebhooks,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: provisioningHistory.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error getting VM provisioning history:', error);
    res.status(500).json({ error: 'Failed to get provisioning history' });
  }
});

// Real-time webhook monitoring
router.get('/monitoring/webhooks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const recentWebhooks = db.db.prepare(`
      SELECT * FROM audit_logs 
      WHERE action LIKE '%webhook%'
      AND created_at >= datetime('now', '-24 hours')
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    
    const webhookStats = db.db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN action = 'webhook_processed' THEN 1 END) as successful,
        COUNT(CASE WHEN action = 'webhook_processing_failed' THEN 1 END) as failed
      FROM audit_logs 
      WHERE action LIKE '%webhook%'
      AND created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all();
    
    res.json({
      recentWebhooks: recentWebhooks.map(log => ({
        ...log,
        details: JSON.parse(log.details || '{}')
      })),
      statistics: webhookStats,
      summary: {
        last24Hours: recentWebhooks.length,
        successRate: webhookStats.length > 0 ? 
          (webhookStats.reduce((acc, stat) => acc + stat.successful, 0) / 
           webhookStats.reduce((acc, stat) => acc + stat.total, 0) * 100).toFixed(1) + '%' : 'N/A'
      }
    });
    
  } catch (error) {
    console.error('Error getting webhook monitoring data:', error);
    res.status(500).json({ error: 'Failed to get webhook data' });
  }
});

// User activity analytics  
router.get('/monitoring/user-activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const activeUsers = db.db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.uuid as accountId,
        u.email,
        u.last_login,
        COUNT(vm.vmid) as vmCount,
        u.subscription_data
      FROM users u
      LEFT JOIN vm_assignments vm ON u.id = vm.user_id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.last_login DESC
      LIMIT 50
    `).all();
    
    const subscriptionBreakdown = db.db.prepare(`
      SELECT 
        JSON_EXTRACT(subscription_data, '$.plan') as plan,
        COUNT(*) as count,
        AVG(CASE WHEN JSON_EXTRACT(subscription_data, '$.status') = 'active' THEN 1 ELSE 0 END) as activePercentage
      FROM users 
      WHERE subscription_data IS NOT NULL
      AND JSON_EXTRACT(subscription_data, '$.plan') != 'none'
      GROUP BY JSON_EXTRACT(subscription_data, '$.plan')
    `).all();
    
    res.json({
      activeUsers: activeUsers.map(user => ({
        ...user,
        subscription: user.subscription_data ? JSON.parse(user.subscription_data) : null,
        lastLoginFormatted: user.last_login ? 
          new Date(user.last_login).toLocaleDateString() : 'Never'
      })),
      subscriptionBreakdown,
      totals: {
        totalUsers: activeUsers.length,
        usersWithVMs: activeUsers.filter(u => u.vmCount > 0).length,
        usersWithSubscriptions: activeUsers.filter(u => u.subscription_data).length
      }
    });
    
  } catch (error) {
    console.error('Error getting user activity data:', error);
    res.status(500).json({ error: 'Failed to get user activity data' });
  }
});

module.exports = router; 