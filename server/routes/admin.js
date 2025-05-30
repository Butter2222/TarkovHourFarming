const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const db = require('../services/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
    const { username, email, password, role = 'customer', vmIds = [], subscriptionPlan, subscriptionExpiresAt } = req.body;
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

    // Create user data
    const userData = {
      username,
      email,
      password,
      role,
      vmIds: vmIds || [],
      subscriptionPlan: subscriptionPlan || null,
      subscriptionExpiresAt: subscriptionExpiresAt || null
    };

    const newUser = await db.createUser(userData);
    
    if (newUser) {
      // Log the action
      db.logAction(req.user.id, 'user_created', 'user', newUser.id, { 
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        createdBy: req.user.username 
      }, clientIP);

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
        email, 
        role,
        username: username || 'unchanged',
        vmCount: vmIds ? vmIds.length : 'unchanged',
        updatedBy: req.user.username 
      }, clientIP);

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
        suspendedBy: req.user.username 
      }, clientIP);

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
        activatedBy: req.user.username 
      }, clientIP);

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
        bannedBy: req.user.username 
      }, clientIP);

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
        resetBy: req.user.username 
      }, clientIP);

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
        deletedUser: user.username,
        deletedBy: req.user.username 
      }, clientIP);

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
      recipientEmail: user.email,
      sentBy: req.user.username 
    }, clientIP);

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

    let query = 'SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1';
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
    const { plan, duration, durationType } = req.body; // plan: 'Basic'/'Premium', duration: number, durationType: 'days'/'weeks'/'months'/'years'
    const clientIP = req.ip || req.connection.remoteAddress;

    console.log(`Assigning ${plan} subscription for ${duration} ${durationType} to user ${userId}`);

    // Validation
    if (!plan || !['Basic', 'Premium'].includes(plan)) {
      console.log('Invalid plan:', plan);
      return res.status(400).json({ error: 'Invalid plan. Must be "Basic" or "Premium"' });
    }

    if (!duration || !Number.isInteger(duration) || duration <= 0) {
      console.log('Invalid duration:', duration);
      return res.status(400).json({ error: 'Duration must be a positive integer' });
    }

    if (!durationType || !['days', 'weeks', 'months', 'years'].includes(durationType)) {
      console.log('Invalid duration type:', durationType);
      return res.status(400).json({ error: 'Duration type must be "days", "weeks", "months", or "years"' });
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

    // Update user subscription
    const subscriptionData = {
      plan: plan,
      status: 'active',
      expiresAt: expiryDate
    };

    console.log('Calling updateUserSubscription with:', subscriptionData);

    const result = await db.updateUserSubscription(userId, subscriptionData);

    console.log('Subscription update result:', result);

    if (result) {
      // Log the action
      db.logAction(req.user.id, 'subscription_assigned', 'subscription', plan, {
        assignedTo: user.username,
        assignedBy: req.user.username,
        duration: `${duration} ${durationType}`,
        expiresAt: expiryDate.toISOString()
      }, clientIP);

      console.log('Audit log created for subscription assignment');

      // Fetch updated user to verify
      const updatedUser = await db.findUserById(userId);
      console.log('Post-assignment verification:', updatedUser.subscription);

      res.json({
        message: 'Subscription assigned successfully',
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
    res.status(500).json({ error: 'Failed to assign subscription' });
  }
});

module.exports = router; 