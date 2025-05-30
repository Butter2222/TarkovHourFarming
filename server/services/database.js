const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class DatabaseService {
  constructor() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = path.join(dataDir, 'database.db');
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    
    // Create tables if they don't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
        active BOOLEAN DEFAULT 1,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
        subscription_plan TEXT,
        subscription_expires_at TEXT,
        subscription_data TEXT, -- JSON data for Stripe integration
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      );

      CREATE TABLE IF NOT EXISTS vm_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        vm_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, vm_id)
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT, -- JSON data
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);
    
    // Ensure status column exists (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned'))`);
      console.log('✅ Added status column to users table');
    } catch (error) {
      // Column probably already exists
      if (!error.message.includes('duplicate column name')) {
        console.error('❌ Error adding status column:', error);
      }
    }
    
    // Update existing users to set status based on active field
    try {
      this.db.exec(`
        UPDATE users 
        SET status = CASE 
          WHEN active = 1 THEN 'active'
          ELSE 'suspended'
        END
        WHERE status IS NULL OR status = ''
      `);
      console.log('✅ Migrated existing users to status system');
    } catch (error) {
      console.error('❌ Error migrating user statuses:', error);
    }
    
    // Prepare common statements
    this.prepareStatements();
    
    // Initialize account settings schema
    this.initializeAccountSettingsSchema();
  }
  
  prepareStatements() {
    // User statements
    this.statements = {
      findUserByUsername: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.username = ? AND u.active = 1
        GROUP BY u.id
      `),
      
      findUserByEmail: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.email = ? AND u.active = 1
        GROUP BY u.id
      `),
      
      findUserById: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.id = ? AND u.active = 1
        GROUP BY u.id
      `),
      
      findUserByUuid: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.uuid = ? AND u.active = 1
        GROUP BY u.id
      `),
      
      createUser: this.db.prepare(`
        INSERT INTO users (uuid, username, email, password_hash, role, subscription_plan, subscription_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      
      updateLastLogin: this.db.prepare(`
        UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
      `),
      
      assignVMToUser: this.db.prepare(`
        INSERT OR IGNORE INTO vm_assignments (user_id, vm_id) VALUES (?, ?)
      `),
      
      removeVMFromUser: this.db.prepare(`
        DELETE FROM vm_assignments WHERE user_id = ? AND vm_id = ?
      `),
      
      getUserVMIds: this.db.prepare(`
        SELECT vm_id FROM vm_assignments WHERE user_id = ?
      `),
      
      // Audit logging
      addAuditLog: this.db.prepare(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      
      // Session management
      createSession: this.db.prepare(`
        INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `),
      
      deleteSession: this.db.prepare(`
        DELETE FROM sessions WHERE token_hash = ?
      `),
      
      cleanExpiredSessions: this.db.prepare(`
        DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP
      `),
      
      // Update user status
      updateUserStatus: this.db.prepare(`
        UPDATE users SET status = ?, active = ? WHERE id = ?
      `),
      
      // Find user for login validation (includes suspended/banned accounts)
      findUserForLogin: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.username = ?
        GROUP BY u.id
      `),
      
      // Find user by ID for auth validation (includes suspended/banned accounts)
      findUserByIdForAuth: this.db.prepare(`
        SELECT u.*, 
               GROUP_CONCAT(va.vm_id) as vm_ids
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        WHERE u.id = ?
        GROUP BY u.id
      `)
    };
  }
  
  // Generate simplified unique ID (6 characters: letters + numbers)
  generateSimplifiedUuid() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    // Generate 6 random characters
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
  
  // Ensure UUID is unique by checking database
  async generateUniqueSimplifiedUuid() {
    let uuid;
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      uuid = this.generateSimplifiedUuid();
      attempts++;
      
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique UUID after maximum attempts');
      }
    } while (this.checkUuidExists(uuid));
    
    return uuid;
  }
  
  checkUuidExists(uuid) {
    const stmt = this.db.prepare('SELECT 1 FROM users WHERE uuid = ? LIMIT 1');
    return !!stmt.get(uuid);
  }
  
  // User management methods
  async findUserByUsername(username) {
    const user = this.statements.findUserByUsername.get(username);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  // Find user for login validation (includes suspended/banned users)
  async findUserForLogin(username) {
    const user = this.statements.findUserForLogin.get(username);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  async findUserByEmail(email) {
    const user = this.statements.findUserByEmail.get(email);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  async findUserById(id) {
    const user = this.statements.findUserById.get(id);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  // Find user by ID for auth validation (includes suspended/banned users)
  async findUserByIdForAuth(id) {
    const user = this.statements.findUserByIdForAuth.get(id);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  async findUserByUuid(uuid) {
    const user = this.statements.findUserByUuid.get(uuid);
    if (!user) return null;
    
    return this.formatUser(user);
  }
  
  formatUser(user) {
    let subscription = {
      plan: user.subscription_plan || 'none',
      expiresAt: user.subscription_expires_at
    };

    // Parse additional subscription data if available
    if (user.subscription_data) {
      try {
        const parsedData = JSON.parse(user.subscription_data);
        subscription = { ...subscription, ...parsedData };
      } catch (error) {
        console.error('Error parsing subscription data:', error);
      }
    }

    return {
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      password: user.password_hash, // Keep same interface
      role: user.role,
      active: Boolean(user.active),
      status: user.status || 'active',
      createdAt: user.created_at,
      lastLogin: user.last_login,
      vmIds: user.vm_ids ? user.vm_ids.split(',').map(Number) : [],
      subscription
    };
  }
  
  async createUser(userData) {
    const { username, email, password, role = 'customer', vmIds = [], subscriptionPlan, subscriptionExpiresAt } = userData;
    
    // Hash password with high cost factor for production
    const passwordHash = await bcrypt.hash(password, 12);
    
    const uuid = await this.generateUniqueSimplifiedUuid();
    
    try {
      const result = this.statements.createUser.run(
        uuid,
        username,
        email,
        passwordHash,
        role,
        subscriptionPlan || null,
        subscriptionExpiresAt || null
      );
      
      const userId = result.lastInsertRowid;
      
      // Assign VMs
      for (const vmId of vmIds) {
        this.statements.assignVMToUser.run(userId, vmId);
      }
      
      return await this.findUserById(userId);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Username or email already exists');
      }
      throw error;
    }
  }
  
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
  
  async updateLastLogin(userId) {
    this.statements.updateLastLogin.run(userId);
  }
  
  getUserVMIds(userId) {
    const rows = this.statements.getUserVMIds.all(userId);
    return rows.map(row => row.vm_id);
  }
  
  canAccessVM(userId, vmId) {
    const user = this.statements.findUserById.get(userId);
    if (!user) return false;
    
    // Admin can access all VMs
    if (user.role === 'admin') return true;
    
    // Check if user has access to this specific VM
    const vmIds = this.getUserVMIds(userId);
    return vmIds.includes(parseInt(vmId));
  }
  
  // Audit logging
  logAction(userId, action, resourceType = null, resourceId = null, details = null, ipAddress = null) {
    try {
      this.statements.addAuditLog.run(
        userId,
        action,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null,
        ipAddress
      );
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  }
  
  // Session management
  createSession(userId, tokenHash, expiresAt, ipAddress = null, userAgent = null) {
    try {
      this.statements.createSession.run(userId, tokenHash, expiresAt, ipAddress, userAgent);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }
  
  deleteSession(tokenHash) {
    this.statements.deleteSession.run(tokenHash);
  }
  
  cleanupExpiredSessions() {
    this.statements.cleanExpiredSessions.run();
  }
  
  // VM assignment management
  assignVMToUser(userId, vmId) {
    this.statements.assignVMToUser.run(userId, vmId);
  }
  
  removeVMFromUser(userId, vmId) {
    this.statements.removeVMFromUser.run(userId, vmId);
  }
  
  // Subscription management
  async updateUserSubscription(userId, subscriptionData) {
    const {
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      status,
      expiresAt,
      currentPeriodEnd,
      canceledAt
    } = subscriptionData;

    console.log('Updating subscription for user:', userId, subscriptionData);
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Subscription update timeout')), 10000)
    );

    try {
      return await Promise.race([timeoutPromise, this._performSubscriptionUpdate(userId, subscriptionData)]);
    } catch (error) {
      console.error('Error updating user subscription:', error);
      console.error('Failed subscription data:', subscriptionData);
      throw error;
    }
  }

  async _performSubscriptionUpdate(userId, subscriptionData) {
    const {
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      status,
      expiresAt,
      currentPeriodEnd,
      canceledAt
    } = subscriptionData;

    // Get current user data
    const user = await this.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log('Current user subscription:', user.subscription);

    // Properly handle date conversion
    const formatDate = (date) => {
      if (!date) return null;
      if (typeof date === 'string') return date;
      if (date instanceof Date) return date.toISOString();
      // Handle case where date might be passed as timestamp
      if (typeof date === 'number') return new Date(date).toISOString();
      return date;
    };

    // Merge with existing subscription data
    const updatedSubscription = {
      ...user.subscription,
      ...(plan && { plan }),
      ...(stripeCustomerId && { stripeCustomerId }),
      ...(stripeSubscriptionId && { stripeSubscriptionId }),
      ...(status && { status }),
      ...(expiresAt && { expiresAt: formatDate(expiresAt) }),
      ...(currentPeriodEnd && { currentPeriodEnd: formatDate(currentPeriodEnd) }),
      ...(canceledAt && { canceledAt: formatDate(canceledAt) })
    };

    console.log('Updated subscription data:', updatedSubscription);

    // Update user record with new subscription data
    const updateSubscription = this.db.prepare(`
      UPDATE users 
      SET subscription_plan = ?, 
          subscription_expires_at = ?,
          subscription_data = ?
      WHERE id = ?
    `);

    const result = updateSubscription.run(
      updatedSubscription.plan || null,
      updatedSubscription.expiresAt || null,
      JSON.stringify(updatedSubscription),
      userId
    );

    console.log(`Updated subscription for user ${userId}:`, updatedSubscription);
    console.log('Database update result:', { changes: result.changes, lastInsertRowid: result.lastInsertRowid });

    // Verify the update by fetching the user again
    const verifyUser = await this.findUserById(userId);
    console.log('Verification - updated user subscription:', verifyUser.subscription);

    return updatedSubscription;
  }
  
  // Admin user management functions
  async getAllUsers() {
    const stmt = this.db.prepare(`
      SELECT u.*, 
             GROUP_CONCAT(va.vm_id) as vm_ids
      FROM users u
      LEFT JOIN vm_assignments va ON u.id = va.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    
    const users = stmt.all();
    return users.map(user => this.formatUser(user));
  }

  async updateUser(userId, userData) {
    const { email, role, username } = userData;
    
    try {
      // Build dynamic SQL based on what fields are being updated
      const fields = [];
      const values = [];
      
      if (email) {
        fields.push('email = ?');
        values.push(email);
      }
      
      if (role) {
        fields.push('role = ?');
        values.push(role);
      }
      
      if (username) {
        fields.push('username = ?');
        values.push(username);
      }
      
      if (fields.length === 0) {
        throw new Error('No fields to update');
      }
      
      values.push(userId); // Add userId for WHERE clause
      
      const updateStmt = this.db.prepare(`
        UPDATE users 
        SET ${fields.join(', ')}
        WHERE id = ?
      `);
      
      const result = updateStmt.run(...values);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async updateUserVMAssignments(userId, vmIds) {
    try {
      // Begin transaction
      const transaction = this.db.transaction(() => {
        // Remove all existing VM assignments for this user
        const deleteStmt = this.db.prepare('DELETE FROM vm_assignments WHERE user_id = ?');
        deleteStmt.run(userId);
        
        // Add new VM assignments
        if (vmIds && vmIds.length > 0) {
          const insertStmt = this.db.prepare('INSERT INTO vm_assignments (user_id, vm_id) VALUES (?, ?)');
          for (const vmId of vmIds) {
            insertStmt.run(userId, vmId);
          }
        }
      });
      
      transaction();
      return true;
    } catch (error) {
      console.error('Error updating VM assignments:', error);
      throw error;
    }
  }

  async updateUserStatus(userId, active) {
    try {
      const result = this.statements.updateUserStatus.run(
        active ? 'active' : 'suspended',
        active ? 1 : 0,
        userId
      );
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  }

  async updateUserStatusTo(userId, status) {
    try {
      // Map status to active boolean
      const active = status === 'active' ? 1 : 0;
      
      const result = this.statements.updateUserStatus.run(status, active, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user status to:', status, error);
      throw error;
    }
  }

  async updateUserPassword(userId, hashedPassword) {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE users 
        SET password_hash = ?
        WHERE id = ?
      `);
      
      const result = updateStmt.run(hashedPassword, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user password:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      // Delete user (VM assignments will be deleted automatically due to foreign key)
      const deleteStmt = this.db.prepare(`
        DELETE FROM users WHERE id = ?
      `);
      
      const result = deleteStmt.run(userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getUserAuditLogs(userId, limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM audit_logs 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `);
      
      return stmt.all(userId, limit);
    } catch (error) {
      console.error('Error fetching user audit logs:', error);
      throw error;
    }
  }

  async getSystemStats() {
    try {
      // Get user counts
      const userCountsStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN active = 1 THEN 1 END) as active_users,
          COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
          COUNT(CASE WHEN role = 'customer' THEN 1 END) as customer_users
        FROM users
      `);
      
      // Get subscription counts
      const subscriptionCountsStmt = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN subscription_plan IS NOT NULL AND subscription_plan != 'none' THEN 1 END) as active_subscriptions,
          COUNT(CASE WHEN subscription_plan = 'Basic' THEN 1 END) as basic_subscriptions,
          COUNT(CASE WHEN subscription_plan = 'Premium' THEN 1 END) as premium_subscriptions
        FROM users
      `);
      
      // Get recent activity count
      const recentActivityStmt = this.db.prepare(`
        SELECT COUNT(*) as recent_logins
        FROM users 
        WHERE last_login > datetime('now', '-7 days')
      `);

      const userCounts = userCountsStmt.get();
      const subscriptionCounts = subscriptionCountsStmt.get();
      const recentActivity = recentActivityStmt.get();

      return {
        ...userCounts,
        ...subscriptionCounts,
        ...recentActivity
      };
    } catch (error) {
      console.error('Error fetching system stats:', error);
      throw error;
    }
  }
  
  // Get normalized subscription status for a user
  getSubscriptionStatus(subscription) {
    if (!subscription || !subscription.plan || subscription.plan === 'none') {
      return {
        plan: 'none',
        status: 'inactive',
        isActive: false,
        isExpired: false,
        isCancelled: false,
        expiresAt: null
      };
    }

    if (!subscription.expiresAt) {
      return {
        ...subscription,
        status: subscription.status || 'active',
        isActive: true,
        isExpired: false,
        isCancelled: subscription.status === 'cancel_at_period_end'
      };
    }

    const expiryDate = new Date(subscription.expiresAt);
    const now = new Date();
    const isExpired = expiryDate <= now;
    const isCancelled = subscription.status === 'cancel_at_period_end';
    const isActive = !isExpired && !isCancelled;

    return {
      ...subscription,
      status: subscription.status || (isExpired ? 'expired' : 'active'),
      isActive,
      isExpired,
      isCancelled
    };
  }
  
  // Health check
  isHealthy() {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
  
  close() {
    this.db.close();
  }

  // New comprehensive analytics methods
  async getAnalytics() {
    try {
      // User Growth Analytics
      const userGrowthStmt = this.db.prepare(`
        SELECT 
          date(created_at) as date,
          COUNT(*) as new_users
        FROM users 
        WHERE created_at >= date('now', '-30 days')
        GROUP BY date(created_at)
        ORDER BY date(created_at)
      `);

      // Login Activity Analytics
      const loginActivityStmt = this.db.prepare(`
        SELECT 
          date(last_login) as date,
          COUNT(DISTINCT id) as active_users
        FROM users 
        WHERE last_login >= datetime('now', '-30 days')
        GROUP BY date(last_login)
        ORDER BY date(last_login)
      `);

      // User Status Distribution
      const statusDistributionStmt = this.db.prepare(`
        SELECT 
          status,
          COUNT(*) as count
        FROM users
        GROUP BY status
      `);

      // Subscription Analytics
      const subscriptionAnalyticsStmt = this.db.prepare(`
        SELECT 
          subscription_plan,
          COUNT(*) as count,
          COUNT(CASE WHEN subscription_expires_at > datetime('now') THEN 1 END) as active_count
        FROM users
        WHERE subscription_plan IS NOT NULL AND subscription_plan != 'none'
        GROUP BY subscription_plan
      `);

      // VM Assignment Analytics
      const vmAnalyticsStmt = this.db.prepare(`
        SELECT 
          u.role,
          COUNT(DISTINCT va.vm_id) as vms_assigned,
          COUNT(DISTINCT u.id) as users_with_vms
        FROM users u
        LEFT JOIN vm_assignments va ON u.id = va.user_id
        GROUP BY u.role
      `);

      // Recent Activity Analytics
      const recentActivityStmt = this.db.prepare(`
        SELECT 
          action,
          resource_type,
          COUNT(*) as count,
          datetime(MAX(created_at)) as last_occurrence
        FROM audit_logs 
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY action, resource_type
        ORDER BY count DESC
        LIMIT 10
      `);

      // Top Active Users
      const topUsersStmt = this.db.prepare(`
        SELECT 
          u.username,
          u.email,
          u.role,
          u.last_login,
          COUNT(al.id) as activity_count
        FROM users u
        LEFT JOIN audit_logs al ON u.id = al.user_id AND al.created_at >= datetime('now', '-30 days')
        WHERE u.active = 1
        GROUP BY u.id
        ORDER BY activity_count DESC, u.last_login DESC
        LIMIT 10
      `);

      // Registration Trends (by month)
      const registrationTrendsStmt = this.db.prepare(`
        SELECT 
          strftime('%Y-%m', created_at) as month,
          COUNT(*) as registrations
        FROM users
        WHERE created_at >= date('now', '-12 months')
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month
      `);

      return {
        userGrowth: userGrowthStmt.all(),
        loginActivity: loginActivityStmt.all(),
        statusDistribution: statusDistributionStmt.all(),
        subscriptionAnalytics: subscriptionAnalyticsStmt.all(),
        vmAnalytics: vmAnalyticsStmt.all(),
        recentActivity: recentActivityStmt.all(),
        topUsers: topUsersStmt.all(),
        registrationTrends: registrationTrendsStmt.all()
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      throw error;
    }
  }

  async getUserActivityMetrics(userId) {
    try {
      // Get user's activity breakdown
      const activityBreakdownStmt = this.db.prepare(`
        SELECT 
          action,
          resource_type,
          COUNT(*) as count,
          datetime(MAX(created_at)) as last_occurrence
        FROM audit_logs 
        WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY action, resource_type
        ORDER BY count DESC
      `);

      // Get user's daily activity for the last 30 days
      const dailyActivityStmt = this.db.prepare(`
        SELECT 
          date(created_at) as date,
          COUNT(*) as activity_count
        FROM audit_logs 
        WHERE user_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY date(created_at)
        ORDER BY date(created_at)
      `);

      // Get user's VM usage
      const vmUsageStmt = this.db.prepare(`
        SELECT vm_id FROM vm_assignments WHERE user_id = ?
      `);

      return {
        activityBreakdown: activityBreakdownStmt.all(userId),
        dailyActivity: dailyActivityStmt.all(userId),
        vmUsage: vmUsageStmt.all(userId)
      };
    } catch (error) {
      console.error('Error fetching user activity metrics:', error);
      throw error;
    }
  }

  // Add missing database columns and methods for account settings
  async initializeAccountSettingsSchema() {
    try {
      // Add new columns for extended profile data
      this.db.exec(`
        ALTER TABLE users ADD COLUMN display_name TEXT;
        ALTER TABLE users ADD COLUMN bio TEXT;
        ALTER TABLE users ADD COLUMN timezone TEXT;
        ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'en';
        ALTER TABLE users ADD COLUMN preferences TEXT; -- JSON data for user preferences
      `);
      console.log('✅ Added account settings columns to users table');
    } catch (error) {
      // Columns probably already exist
      if (!error.message.includes('duplicate column name')) {
        console.error('❌ Error adding account settings columns:', error);
      }
    }

    // Create login_history table
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS login_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          success BOOLEAN NOT NULL,
          failure_reason TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
      `);
      console.log('✅ Created login_history table');
    } catch (error) {
      console.error('❌ Error creating login_history table:', error);
    }

    // Add indexes for performance
    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_login_history_timestamp ON login_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      `);
      console.log('✅ Created performance indexes');
    } catch (error) {
      console.error('❌ Error creating indexes:', error);
    }
  }

  // Update user profile with extended fields
  async updateUserProfile(userId, profileData) {
    const { email, username } = profileData;
    
    try {
      const updateStmt = this.db.prepare(`
        UPDATE users 
        SET email = ?, 
            username = ?
        WHERE id = ?
      `);
      
      const result = updateStmt.run(email, username, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  // Update user preferences
  async updateUserPreferences(userId, preferences) {
    try {
      const updateStmt = this.db.prepare(`
        UPDATE users 
        SET preferences = ?
        WHERE id = ?
      `);
      
      const result = updateStmt.run(JSON.stringify(preferences), userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  // Get user sessions
  async getUserSessions(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, token_hash, ip_address, user_agent, created_at, expires_at
        FROM sessions 
        WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY created_at DESC
      `);
      
      return stmt.all(userId);
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      throw error;
    }
  }

  // Get session by ID
  async getSessionById(sessionId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions WHERE id = ?
      `);
      
      return stmt.get(sessionId);
    } catch (error) {
      console.error('Error fetching session by ID:', error);
      throw error;
    }
  }

  // Terminate a session
  async terminateSession(sessionId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM sessions WHERE id = ?
      `);
      
      const result = stmt.run(sessionId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error terminating session:', error);
      throw error;
    }
  }

  // Invalidate all user sessions except current one
  async invalidateUserSessions(userId, currentSessionId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM sessions 
        WHERE user_id = ? AND id != ?
      `);
      
      const result = stmt.run(userId, currentSessionId || 0);
      return result.changes;
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
      throw error;
    }
  }

  // Log login attempt
  async logLoginAttempt(userId, success, ipAddress, userAgent, failureReason = null) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO login_history (user_id, ip_address, user_agent, success, failure_reason)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(userId, ipAddress, userAgent, success ? 1 : 0, failureReason);
    } catch (error) {
      console.error('Error logging login attempt:', error);
    }
  }

  // Get user login history
  async getUserLoginHistory(userId, limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT ip_address, user_agent, success, failure_reason, timestamp
        FROM login_history 
        WHERE user_id = ?
        ORDER BY timestamp DESC 
        LIMIT ?
      `);
      
      return stmt.all(userId, limit);
    } catch (error) {
      console.error('Error fetching login history:', error);
      throw error;
    }
  }

  // Get user profile with extended fields
  async getUserProfile(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          id, uuid, username, email, display_name, bio, timezone, language, 
          preferences, role, active, status, created_at, last_login,
          subscription_plan, subscription_expires_at, subscription_data
        FROM users 
        WHERE id = ?
      `);
      
      const user = stmt.get(userId);
      if (!user) return null;

      // Parse preferences
      let preferences = {};
      if (user.preferences) {
        try {
          preferences = JSON.parse(user.preferences);
        } catch (error) {
          console.error('Error parsing user preferences:', error);
        }
      }

      // Parse subscription data
      let subscription = {
        plan: user.subscription_plan || 'none',
        expiresAt: user.subscription_expires_at
      };

      if (user.subscription_data) {
        try {
          const parsedData = JSON.parse(user.subscription_data);
          subscription = { ...subscription, ...parsedData };
        } catch (error) {
          console.error('Error parsing subscription data:', error);
        }
      }

      return {
        id: user.id,
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        displayName: user.display_name || user.username,
        bio: user.bio,
        timezone: user.timezone,
        language: user.language || 'en',
        preferences,
        role: user.role,
        active: Boolean(user.active),
        status: user.status || 'active',
        createdAt: user.created_at,
        lastLogin: user.last_login,
        subscription
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      throw error;
    }
  }

  // Export comprehensive user data
  async exportUserData(userId) {
    try {
      // Get user profile
      const profile = await this.getUserProfile(userId);
      
      // Get user sessions
      const sessions = await this.getUserSessions(userId);
      
      // Get audit logs
      const auditLogs = await this.getUserAuditLogs(userId, 1000);
      
      // Get login history
      const loginHistory = await this.getUserLoginHistory(userId, 1000);
      
      // Get VM assignments
      const vmAssignments = this.getUserVMIds(userId);

      return {
        account: {
          id: profile.id,
          uuid: profile.uuid,
          createdAt: profile.createdAt,
          role: profile.role,
          status: profile.status
        },
        profile: {
          username: profile.username,
          email: profile.email,
          displayName: profile.displayName,
          bio: profile.bio,
          timezone: profile.timezone,
          language: profile.language,
          lastLogin: profile.lastLogin
        },
        preferences: profile.preferences,
        sessions: sessions.map(session => ({
          id: session.id,
          ipAddress: session.ip_address,
          userAgent: session.user_agent,
          createdAt: session.created_at,
          expiresAt: session.expires_at
        })),
        auditLogs: auditLogs.map(log => ({
          action: log.action,
          resourceType: log.resource_type,
          resourceId: log.resource_id,
          details: log.details,
          ipAddress: log.ip_address,
          timestamp: log.created_at
        })),
        subscriptions: profile.subscription,
        vmAssignments: vmAssignments,
        loginHistory: loginHistory
      };
    } catch (error) {
      console.error('Error exporting user data:', error);
      throw error;
    }
  }

  // Get admin count
  async getAdminCount() {
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM users 
        WHERE role = 'admin' AND active = 1
      `);
      
      const result = stmt.get();
      return result.count;
    } catch (error) {
      console.error('Error getting admin count:', error);
      throw error;
    }
  }

  // Enhanced formatUser to include new fields
  formatUser(user) {
    let subscription = {
      plan: user.subscription_plan || 'none',
      expiresAt: user.subscription_expires_at
    };

    // Parse additional subscription data if available
    if (user.subscription_data) {
      try {
        const parsedData = JSON.parse(user.subscription_data);
        subscription = { ...subscription, ...parsedData };
      } catch (error) {
        console.error('Error parsing subscription data:', error);
      }
    }

    // Parse preferences
    let preferences = {};
    if (user.preferences) {
      try {
        preferences = JSON.parse(user.preferences);
      } catch (error) {
        console.error('Error parsing user preferences:', error);
      }
    }

    return {
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      displayName: user.display_name || user.username,
      bio: user.bio,
      timezone: user.timezone,
      language: user.language || 'en',
      preferences,
      password: user.password_hash, // Keep same interface
      role: user.role,
      active: Boolean(user.active),
      status: user.status || 'active',
      createdAt: user.created_at,
      lastLogin: user.last_login,
      vmIds: user.vm_ids ? user.vm_ids.split(',').map(Number) : [],
      subscription
    };
  }
}

// Export singleton instance
module.exports = new DatabaseService(); 