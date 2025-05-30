const express = require('express');
const { generateToken, authenticateToken } = require('../middleware/auth');
const db = require('../services/database');

const router = express.Router();

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user (including suspended/banned users for proper error handling)
    const user = await db.findUserForLogin(username);
    if (!user) {
      // Log failed attempt with generic user ID
      await db.logLoginAttempt(null, false, clientIP, req.get('User-Agent'), 'user_not_found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check account status
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account banned', accountStatus: 'banned' });
    }
    
    if (user.status === 'suspended') {
      return res.status(423).json({ error: 'Account temporarily unavailable', accountStatus: 'suspended' });
    }

    // Verify password
    const isValidPassword = await db.verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      // Log failed attempt
      await db.logLoginAttempt(user.id, false, clientIP, req.get('User-Agent'), 'invalid_password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login time
    await db.updateLastLogin(user.id);

    // Log successful login attempt
    await db.logLoginAttempt(user.id, true, clientIP, req.get('User-Agent'));

    // Generate token
    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role || 'customer'
    });

    // Log successful login
    db.logAction(user.id, 'login_success', 'user', username, null, clientIP, user.id);

    // Return user data (without password) and token
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Login successful',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, vmIds, role, subscriptionPlan, subscriptionExpiresAt, selectedPlan } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // For customer registrations from the frontend, use selectedPlan if provided
    const finalSubscriptionPlan = selectedPlan || subscriptionPlan;

    // Create new user
    const newUser = await db.createUser({
      username,
      email,
      password,
      role: role || 'customer',
      vmIds: vmIds || [],
      subscriptionPlan: finalSubscriptionPlan,
      subscriptionExpiresAt
    });

    // Log user creation
    db.logAction(newUser.id, 'user_created', 'user', username, { 
      role: newUser.role, 
      vmIds: newUser.vmIds,
      selectedPlan: finalSubscriptionPlan
    }, clientIP, newUser.id);

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({
      message: 'Account created successfully',
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.message.includes('already exists')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Validate token endpoint
router.get('/validate', authenticateToken, async (req, res) => {
  try {
    // Get fresh user data from database
    const user = await db.findUserByIdForAuth(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check account status
    if (user.status === 'banned') {
      return res.status(403).json({ error: 'Account banned', accountStatus: 'banned' });
    }
    
    if (user.status === 'suspended') {
      return res.status(423).json({ error: 'Account temporarily unavailable', accountStatus: 'suspended' });
    }

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: 'Token is valid',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Check if user still exists before logging (they might have just deleted their account)
  try {
    const user = await db.findUserByIdForAuth(req.user.id);
    if (user) {
      // Only log if user still exists
      db.logAction(req.user.id, 'logout', 'user', req.user.username, null, clientIP, req.user.id);
    }
  } catch (error) {
    // Silently handle error - user might have been deleted
    console.log('User not found for logout logging (likely deleted account):', req.user.id);
  }
  
  res.json({ message: 'Logout successful' });
});

module.exports = router; 