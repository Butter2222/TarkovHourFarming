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
    
    // Configure SQLite for better performance and stability
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.db.pragma('synchronous = NORMAL'); // Balance between safety and performance
    this.db.pragma('cache_size = 1000'); // Increase cache size
    this.db.pragma('temp_store = memory'); // Store temp tables in memory
    this.db.pragma('mmap_size = 268435456'); // Use memory-mapped I/O (256MB)
    
    // Set a busy timeout to prevent immediate failures on lock
    this.db.pragma('busy_timeout = 5000'); // 5 seconds
    
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
        performed_by_user_id INTEGER,
        action TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        details TEXT, -- JSON data
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (performed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
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

      -- Payment tracking tables
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        stripe_payment_intent_id TEXT UNIQUE,
        stripe_checkout_session_id TEXT,
        stripe_subscription_id TEXT,
        stripe_customer_id TEXT,
        amount INTEGER NOT NULL, -- Amount in cents
        currency TEXT DEFAULT 'usd',
        status TEXT NOT NULL, -- pending, succeeded, failed, canceled, refunded
        payment_method TEXT, -- card, bank_transfer, etc
        plan_id TEXT, -- basic, premium
        plan_name TEXT,
        metadata TEXT, -- JSON data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS payment_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER,
        user_id INTEGER NOT NULL,
        stripe_payment_intent_id TEXT,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'usd',
        status TEXT NOT NULL, -- requires_payment_method, requires_confirmation, requires_action, processing, succeeded, requires_capture, canceled
        failure_code TEXT, -- card_declined, insufficient_funds, etc
        failure_message TEXT,
        payment_method_id TEXT,
        last_payment_error TEXT, -- JSON data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER,
        user_id INTEGER NOT NULL,
        stripe_refund_id TEXT UNIQUE NOT NULL,
        stripe_payment_intent_id TEXT NOT NULL,
        amount INTEGER NOT NULL, -- Amount refunded in cents
        currency TEXT DEFAULT 'usd',
        reason TEXT, -- duplicate, fraudulent, requested_by_customer
        status TEXT NOT NULL, -- pending, succeeded, failed, canceled
        failure_reason TEXT,
        metadata TEXT, -- JSON data
        admin_user_id INTEGER, -- Who processed the refund
        admin_reason TEXT, -- Admin's reason for refund
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (admin_user_id) REFERENCES users (id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS stripe_webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripe_event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL, -- payment_intent.succeeded, customer.subscription.updated, etc
        object_id TEXT, -- The ID of the object (payment intent, subscription, etc)
        user_id INTEGER, -- Associated user if applicable
        raw_data TEXT NOT NULL, -- Full JSON webhook data
        processed BOOLEAN DEFAULT FALSE,
        processing_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS payment_disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER,
        user_id INTEGER NOT NULL,
        stripe_dispute_id TEXT UNIQUE NOT NULL,
        stripe_charge_id TEXT NOT NULL,
        amount INTEGER NOT NULL, -- Disputed amount in cents
        currency TEXT DEFAULT 'usd',
        reason TEXT, -- duplicate, fraudulent, subscription_canceled, etc
        status TEXT NOT NULL, -- warning_needs_response, warning_under_review, warning_closed, needs_response, under_review, charge_refunded, won, lost
        evidence_deadline INTEGER, -- Unix timestamp
        is_charge_refundable BOOLEAN,
        metadata TEXT, -- JSON data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      -- VM Setup tracking table
      CREATE TABLE IF NOT EXISTS vm_setup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan_type TEXT NOT NULL, -- hour_booster, dual_mode, kd_drop
        vm_count INTEGER NOT NULL,
        vm_ids TEXT, -- JSON array of VM IDs
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'setup_in_progress', 'file_uploaded', 'completed', 'failed')),
        setup_data TEXT, -- JSON data for setup progress
        hwho_file_path TEXT, -- Path to uploaded hwho.dat file
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_vm_setup_user_id ON vm_setup(user_id);
      CREATE INDEX IF NOT EXISTS idx_vm_setup_status ON vm_setup(status);

      -- Indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
      
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment_id ON payment_attempts(payment_id);
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_id ON payment_attempts(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_attempts_status ON payment_attempts(status);
      
      CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_user_id ON refunds(user_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_stripe_refund_id ON refunds(stripe_refund_id);
      
      CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_event_id ON stripe_webhooks(stripe_event_id);
      CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_event_type ON stripe_webhooks(event_type);
      CREATE INDEX IF NOT EXISTS idx_stripe_webhooks_processed ON stripe_webhooks(processed);
      
      CREATE INDEX IF NOT EXISTS idx_payment_disputes_user_id ON payment_disputes(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON payment_disputes(status);
    `);
    
    // Ensure status column exists (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned'))`);
      console.log('Added status column to users table');
    } catch (error) {
      // Column probably already exists
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding status column:', error);
      }
    }
    
    // Ensure subscription_data column exists (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN subscription_data TEXT`);
      console.log('Added subscription_data column to users table');
    } catch (error) {
      // Column probably already exists
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding subscription_data column:', error);
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
      console.log('Migrated existing users to status system');
    } catch (error) {
      console.error('Error migrating user statuses:', error);
    }
    
    // Ensure performed_by_user_id column exists in audit_logs (migration for existing databases)
    try {
      this.db.exec(`ALTER TABLE audit_logs ADD COLUMN performed_by_user_id INTEGER REFERENCES users (id) ON DELETE SET NULL`);
      console.log('✅ Added performed_by_user_id column to audit_logs table');
    } catch (error) {
      // Column probably already exists
      if (!error.message.includes('duplicate column name')) {
        console.error('❌ Error adding performed_by_user_id column:', error);
      }
    }
    
    // Add missing columns migration BEFORE preparing statements
    this.addMissingColumns();
    
    // Prepare common statements
    this.prepareStatements();
    
    // Initialize account settings schema
    this.initializeAccountSettingsSchema();
  }
  
  addMissingColumns() {
    // Add updated_at column to users table if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE users ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to users table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to users:', error);
      }
    }

    // Add updated_at column to vm_assignments table if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE vm_assignments ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE vm_assignments SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to vm_assignments table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to vm_assignments:', error);
      }
    }

    // Add updated_at column to sessions table if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to sessions table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to sessions:', error);
      }
    }

    // Add updated_at column to audit_logs table if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE audit_logs ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE audit_logs SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to audit_logs table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to audit_logs:', error);
      }
    }

    // For tables that should already have updated_at (payments, refunds, payment_disputes)
    // these should be created with updated_at in the main CREATE TABLE, but let's ensure
    // they exist for older databases
    try {
      this.db.exec(`ALTER TABLE payments ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE payments SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to payments table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to payments:', error);
      }
    }

    try {
      this.db.exec(`ALTER TABLE refunds ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE refunds SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to refunds table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to refunds:', error);
      }
    }

    try {
      this.db.exec(`ALTER TABLE payment_disputes ADD COLUMN updated_at DATETIME`);
      this.db.exec(`UPDATE payment_disputes SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
      console.log('Added updated_at column to payment_disputes table');
    } catch (error) {
      if (!error.message.includes('duplicate column name')) {
        console.error('Error adding updated_at column to payment_disputes:', error);
      }
    }
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
        INSERT INTO audit_logs (user_id, performed_by_user_id, action, resource_type, resource_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
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
      `),

      // User operations
      getUserByUsername: this.db.prepare('SELECT * FROM users WHERE username = ?'),
      getUserByEmail: this.db.prepare('SELECT * FROM users WHERE email = ?'),
      getUserById: this.db.prepare('SELECT * FROM users WHERE id = ?'),
      updateUser: this.db.prepare('UPDATE users SET email = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      deleteUser: this.db.prepare('DELETE FROM users WHERE id = ?'),
      updateUserPassword: this.db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
      updateUserLastLogin: this.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'),
      
      // VM assignments
      getUserVMs: this.db.prepare('SELECT vm_id FROM vm_assignments WHERE user_id = ?'),
      clearUserVMs: this.db.prepare('DELETE FROM vm_assignments WHERE user_id = ?'),
      
      // Subscription operations
      updateUserSubscription: this.db.prepare(`
        UPDATE users SET 
          subscription_plan = ?, 
          subscription_expires_at = ?, 
          subscription_data = ?,
          updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `),
      
      // Payment operations
      insertPayment: this.db.prepare(`
        INSERT INTO payments (
          user_id, stripe_payment_intent_id, stripe_checkout_session_id, stripe_subscription_id, 
          stripe_customer_id, amount, currency, status, payment_method, plan_id, plan_name, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updatePayment: this.db.prepare(`
        UPDATE payments SET 
          status = ?, payment_method = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `),

      getPaymentById: this.db.prepare('SELECT * FROM payments WHERE id = ?'),
      getPaymentByStripeId: this.db.prepare('SELECT * FROM payments WHERE stripe_payment_intent_id = ?'),
      getPaymentsByUser: this.db.prepare(`
        SELECT * FROM payments WHERE user_id = ? 
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `),

      // Payment attempts
      insertPaymentAttempt: this.db.prepare(`
        INSERT INTO payment_attempts (
          payment_id, user_id, stripe_payment_intent_id, amount, currency, status, 
          failure_code, failure_message, payment_method_id, last_payment_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getPaymentAttempts: this.db.prepare(`
        SELECT * FROM payment_attempts WHERE payment_id = ? ORDER BY created_at DESC
      `),

      // Refunds
      insertRefund: this.db.prepare(`
        INSERT INTO refunds (
          payment_id, user_id, stripe_refund_id, stripe_payment_intent_id, amount, 
          currency, reason, status, metadata, admin_user_id, admin_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateRefund: this.db.prepare(`
        UPDATE refunds SET 
          status = ?, failure_reason = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE stripe_refund_id = ?
      `),

      getRefundsByUser: this.db.prepare(`
        SELECT r.*, p.plan_name, p.amount as original_amount 
        FROM refunds r 
        LEFT JOIN payments p ON r.payment_id = p.id 
        WHERE r.user_id = ? 
        ORDER BY r.created_at DESC
      `),

      getRefundByStripeId: this.db.prepare('SELECT * FROM refunds WHERE stripe_refund_id = ?'),

      // Webhooks
      insertWebhook: this.db.prepare(`
        INSERT INTO stripe_webhooks (
          stripe_event_id, event_type, object_id, user_id, raw_data
        ) VALUES (?, ?, ?, ?, ?)
      `),

      updateWebhookProcessed: this.db.prepare(`
        UPDATE stripe_webhooks SET 
          processed = TRUE, processed_at = CURRENT_TIMESTAMP, processing_error = ? 
        WHERE stripe_event_id = ?
      `),

      getUnprocessedWebhooks: this.db.prepare(`
        SELECT * FROM stripe_webhooks WHERE processed = FALSE ORDER BY created_at ASC
      `),

      getWebhookByEventId: this.db.prepare('SELECT * FROM stripe_webhooks WHERE stripe_event_id = ?'),

      // Disputes
      insertDispute: this.db.prepare(`
        INSERT INTO payment_disputes (
          payment_id, user_id, stripe_dispute_id, stripe_charge_id, amount, currency, 
          reason, status, evidence_deadline, is_charge_refundable, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateDispute: this.db.prepare(`
        UPDATE payment_disputes SET 
          status = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE stripe_dispute_id = ?
      `),

      getDisputesByUser: this.db.prepare(`
        SELECT * FROM payment_disputes WHERE user_id = ? ORDER BY created_at DESC
      `),

      // Analytics queries
      getPaymentStats: this.db.prepare(`
        SELECT 
          COUNT(*) as total_payments,
          SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue,
          SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) as successful_payments,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
          AVG(CASE WHEN status = 'succeeded' THEN amount ELSE NULL END) as avg_payment_amount
        FROM payments 
        WHERE created_at >= date('now', '-30 days')
      `),

      getRevenueByPlan: this.db.prepare(`
        SELECT 
          plan_id,
          COUNT(*) as payment_count,
          SUM(amount) as total_revenue
        FROM payments 
        WHERE status = 'succeeded' AND created_at >= date('now', '-30 days')
        GROUP BY plan_id
      `),

      // VM Setup operations
      insertVMSetup: this.db.prepare(`
        INSERT INTO vm_setup (user_id, plan_type, vm_count, vm_ids, status, setup_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      updateVMSetupStatus: this.db.prepare(`
        UPDATE vm_setup SET 
          status = ?, setup_data = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ? AND status != 'completed'
      `),

      updateVMSetupFile: this.db.prepare(`
        UPDATE vm_setup SET 
          hwho_file_path = ?, status = ?, setup_data = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ? AND status != 'completed'
      `),

      completeVMSetup: this.db.prepare(`
        UPDATE vm_setup SET 
          status = 'completed', setup_data = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = ? AND status != 'completed'
      `),

      getVMSetupByUser: this.db.prepare(`
        SELECT * FROM vm_setup WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
      `),

      getActiveVMSetup: this.db.prepare(`
        SELECT * FROM vm_setup WHERE user_id = ? AND status != 'completed' ORDER BY created_at DESC LIMIT 1
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
  
  // Alias for subscription manager compatibility
  getUserVMs(userId) {
    return this.getUserVMIds(userId);
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
  logAction(userId, action, resourceType = null, resourceId = null, details = null, ipAddress = null, performedByUserId = null) {
    try {
      this.statements.addAuditLog.run(
        userId,
        performedByUserId || userId, // Use performedByUserId if provided, otherwise use userId as fallback
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
    
    try {
      // Check database health before proceeding
      if (!this.isHealthy()) {
        throw new Error('Database is not healthy - aborting subscription update');
      }

      // Use immediate transaction mode to prevent race conditions
      this.db.pragma('synchronous = NORMAL'); // Ensure immediate writes
      
      // Create transaction with explicit locks to prevent concurrent updates
      const updateTransaction = this.db.transaction((userId, subscriptionData) => {
        // First, lock the user record to prevent concurrent modifications
        const lockStmt = this.db.prepare('SELECT id FROM users WHERE id = ? FOR UPDATE');
        const userLock = lockStmt.get(userId);
        if (!userLock) {
          throw new Error(`User ${userId} not found or locked`);
        }

        return this._performSubscriptionUpdate(userId, subscriptionData);
      });
      
      const result = updateTransaction.immediate(userId, subscriptionData);
      
      console.log(`Successfully updated subscription for user ${userId}`);
      return result;
      
    } catch (error) {
      console.error('Critical error updating user subscription:', error);
      console.error('Failed subscription data:', subscriptionData);
      console.error('User ID:', userId);
      
      // Verify database integrity after error
      try {
        const integrityCheck = this.db.pragma('integrity_check');
        if (integrityCheck[0] !== 'ok') {
          console.error('DATABASE INTEGRITY CHECK FAILED:', integrityCheck);
        }
      } catch (integrityError) {
        console.error('Cannot perform integrity check:', integrityError);
      }
      
      throw new Error(`Subscription update failed for user ${userId}: ${error.message}`);
    }
  }

  _performSubscriptionUpdate(userId, subscriptionData) {
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
    const getUserStmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const user = getUserStmt.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Parse existing subscription data
    let currentSubscription = {};
    try {
      currentSubscription = user.subscription_data ? JSON.parse(user.subscription_data) : {};
    } catch (error) {
      console.error('Error parsing existing subscription data:', error);
      currentSubscription = {};
    }

    console.log('Current user subscription:', currentSubscription);

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
      ...currentSubscription,
      ...(plan && { plan }),
      ...(stripeCustomerId && { stripeCustomerId }),
      ...(stripeSubscriptionId && { stripeSubscriptionId }),
      ...(status && { status }),
      ...(expiresAt && { expiresAt: formatDate(expiresAt) }),
      ...(currentPeriodEnd && { currentPeriodEnd: formatDate(currentPeriodEnd) }),
      ...(canceledAt && { canceledAt: formatDate(canceledAt) })
    };

    console.log('Updated subscription data:', updatedSubscription);

    // Update user record with new subscription data using prepared statement
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

    if (result.changes === 0) {
      throw new Error('Failed to update user subscription - no rows affected');
    }

    console.log(`Updated subscription for user ${userId}:`, updatedSubscription);
    console.log('Database update result:', { changes: result.changes, lastInsertRowid: result.lastInsertRowid });

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

  async deleteUserWithAudit(userId, auditDetails, ipAddress) {
    try {
      // Use a transaction to ensure atomicity
      const transaction = this.db.transaction(() => {
        // First log the action while the user still exists
        this.statements.addAuditLog.run(
          userId,
          userId, // performed_by_user_id - user is deleting their own account
          'account_deleted',
          'account',
          userId,
          JSON.stringify(auditDetails),
          ipAddress
        );
        
        // Then delete the user (VM assignments will be deleted automatically due to foreign key)
        const deleteStmt = this.db.prepare(`
          DELETE FROM users WHERE id = ?
        `);
        
        const result = deleteStmt.run(userId);
        if (result.changes === 0) {
          throw new Error('User not found or already deleted');
        }
        
        return result.changes > 0;
      });
      
      return transaction();
    } catch (error) {
      console.error('Error deleting user with audit:', error);
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
      const totalUsers = this.db.prepare('SELECT COUNT(*) as count FROM users WHERE role = "customer"').get().count;
      
      const activeSubscriptions = this.db.prepare(`
        SELECT COUNT(*) as count FROM users 
        WHERE subscription_data IS NOT NULL 
        AND JSON_EXTRACT(subscription_data, '$.status') = 'active'
        AND JSON_EXTRACT(subscription_data, '$.plan') != 'none'
      `).get().count;
      
      const totalVMAssignments = this.db.prepare('SELECT COUNT(*) as count FROM vm_assignments').get().count;
      
      const recentErrors = this.db.prepare(`
        SELECT COUNT(*) as count FROM audit_logs 
        WHERE (action LIKE '%failed%' OR action LIKE '%error%') 
        AND created_at >= datetime('now', '-24 hours')
      `).get().count;
      
      const recentProvisionings = this.db.prepare(`
        SELECT COUNT(*) as count FROM audit_logs 
        WHERE action = 'vms_provisioned' 
        AND created_at >= datetime('now', '-7 days')
      `).get().count;
      
      return {
        totalUsers,
        activeSubscriptions,
        totalVMAssignments,
        recentErrors,
        recentProvisionings,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Error getting system statistics:', error);
      return {
        totalUsers: 0,
        activeSubscriptions: 0,
        totalVMAssignments: 0,
        recentErrors: 0,
        recentProvisionings: 0,
        lastUpdated: new Date().toISOString(),
        error: error.message
      };
    }
  }
  
  // Get normalized subscription status for a user
  getSubscriptionStatus(subscription, userRole = null) {
    // Admins always have active access regardless of subscription
    if (userRole === 'admin') {
      return {
        plan: 'admin',
        status: 'active',
        isActive: true,
        isExpired: false,
        isCancelled: false,
        expiresAt: null
      };
    }
    
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
      // User Growth Analytics - Fixed to ensure unique users per day
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

      // Subscription Analytics - Updated to group new plan types properly
      const subscriptionAnalyticsStmt = this.db.prepare(`
        SELECT 
          CASE 
            WHEN subscription_plan LIKE '%Hour Booster%' OR subscription_plan LIKE '%hour_booster%' THEN 'Hour Booster'
            WHEN subscription_plan LIKE '%KD Drop%' OR subscription_plan LIKE '%kd_drop%' THEN 'KD Drop'
            WHEN subscription_plan LIKE '%Dual Mode%' OR subscription_plan LIKE '%dual_mode%' THEN 'Dual Mode'
            WHEN subscription_plan = 'Basic' THEN 'Hour Booster'
            WHEN subscription_plan = 'Premium' THEN 'KD Drop'
            ELSE subscription_plan
          END as subscription_plan,
          COUNT(*) as count,
          COUNT(CASE WHEN subscription_expires_at > datetime('now') THEN 1 END) as active_count
        FROM users
        WHERE subscription_plan IS NOT NULL AND subscription_plan != 'none'
        GROUP BY CASE 
          WHEN subscription_plan LIKE '%Hour Booster%' OR subscription_plan LIKE '%hour_booster%' THEN 'Hour Booster'
          WHEN subscription_plan LIKE '%KD Drop%' OR subscription_plan LIKE '%kd_drop%' THEN 'KD Drop'
          WHEN subscription_plan LIKE '%Dual Mode%' OR subscription_plan LIKE '%dual_mode%' THEN 'Dual Mode'
          WHEN subscription_plan = 'Basic' THEN 'Hour Booster'
          WHEN subscription_plan = 'Premium' THEN 'KD Drop'
          ELSE subscription_plan
        END
        ORDER BY count DESC
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

      // Recent Activity Analytics - Filtered to exclude server overview access
      const recentActivityStmt = this.db.prepare(`
        SELECT 
          action,
          resource_type,
          COUNT(*) as count,
          datetime(MAX(created_at)) as last_occurrence
        FROM audit_logs 
        WHERE created_at >= datetime('now', '-7 days')
          AND action NOT LIKE '%server_overview%'
          AND action NOT LIKE '%server-overview%'
          AND action != 'access_server_overview'
          AND action != 'view_server_overview'
          AND action != 'fetch_server_overview'
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

  // Payment Methods
  async recordPayment(paymentData) {
    try {
      console.log('Recording payment:', {
        userId: paymentData.userId,
        stripePaymentIntentId: paymentData.stripePaymentIntentId,
        stripeCheckoutSessionId: paymentData.stripeCheckoutSessionId,
        amount: paymentData.amount,
        status: paymentData.status
      });

      // Check for duplicates by multiple fields to prevent webhook + client verification duplicates
      let existingPayment = null;

      // First check by payment intent ID (most reliable)
      if (paymentData.stripePaymentIntentId) {
        existingPayment = this.statements.getPaymentByStripeId.get(paymentData.stripePaymentIntentId);
        if (existingPayment) {
          console.log('Payment already exists by payment intent ID:', existingPayment.id);
          return existingPayment.id;
        }
      }

      // Then check by checkout session ID
      if (paymentData.stripeCheckoutSessionId) {
        const sessionPayment = this.db.prepare(`
          SELECT * FROM payments WHERE stripe_checkout_session_id = ?
        `).get(paymentData.stripeCheckoutSessionId);
        
        if (sessionPayment) {
          console.log('Payment already exists by checkout session ID:', sessionPayment.id);
          return sessionPayment.id;
        }
      }

      // Check for duplicate by user + amount + recent timeframe (last 5 minutes) to catch edge cases
      const recentDuplicate = this.db.prepare(`
        SELECT * FROM payments 
        WHERE user_id = ? AND amount = ? AND status = 'succeeded' 
        AND created_at > datetime('now', '-5 minutes')
        ORDER BY created_at DESC LIMIT 1
      `).get(paymentData.userId, paymentData.amount);

      if (recentDuplicate) {
        console.log('Potential duplicate payment detected (same user, amount, recent):', recentDuplicate.id);
        // Only skip if it has the same payment intent or session ID
        if (paymentData.stripePaymentIntentId && recentDuplicate.stripe_payment_intent_id === paymentData.stripePaymentIntentId) {
          console.log('Confirmed duplicate by payment intent, skipping');
          return recentDuplicate.id;
        }
        if (paymentData.stripeCheckoutSessionId && recentDuplicate.stripe_checkout_session_id === paymentData.stripeCheckoutSessionId) {
          console.log('Confirmed duplicate by session ID, skipping');
          return recentDuplicate.id;
        }
      }

      console.log('No duplicate found, creating new payment record');

      const result = this.statements.insertPayment.run(
        paymentData.userId,
        paymentData.stripePaymentIntentId || null,
        paymentData.stripeCheckoutSessionId || null,
        paymentData.stripeSubscriptionId || null,
        paymentData.stripeCustomerId || null,
        paymentData.amount,
        paymentData.currency || 'usd',
        paymentData.status,
        paymentData.paymentMethod || null,
        paymentData.planId || null,
        paymentData.planName || null,
        paymentData.metadata ? JSON.stringify(paymentData.metadata) : null
      );

      // Log the payment recording
      this.logAction(
        paymentData.userId,
        'payment_recorded',
        'payment',
        result.lastInsertRowid.toString(),
        {
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: paymentData.status,
          plan: paymentData.planName,
          source: paymentData.metadata?.verificationMethod || 'webhook'
        },
        'system',
        paymentData.performedBy || paymentData.userId
      );

      console.log('Payment recorded successfully with ID:', result.lastInsertRowid);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  }

  async updatePaymentStatus(paymentId, status, paymentMethod = null, metadata = null) {
    try {
      const result = this.statements.updatePayment.run(
        status,
        paymentMethod,
        metadata ? JSON.stringify(metadata) : null,
        paymentId
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw error;
    }
  }

  async getPaymentHistory(userId, limit = 50, offset = 0) {
    try {
      const payments = this.statements.getPaymentsByUser.all(userId, limit, offset);
      
      // Parse metadata for each payment
      return payments.map(payment => ({
        ...payment,
        metadata: payment.metadata ? JSON.parse(payment.metadata) : null,
        amountFormatted: `$${(payment.amount / 100).toFixed(2)}`
      }));
    } catch (error) {
      console.error('Error getting payment history:', error);
      throw error;
    }
  }

  async recordPaymentAttempt(attemptData) {
    try {
      const result = this.statements.insertPaymentAttempt.run(
        attemptData.paymentId || null,
        attemptData.userId,
        attemptData.stripePaymentIntentId || null,
        attemptData.amount,
        attemptData.currency || 'usd',
        attemptData.status,
        attemptData.failureCode || null,
        attemptData.failureMessage || null,
        attemptData.paymentMethodId || null,
        attemptData.lastPaymentError ? JSON.stringify(attemptData.lastPaymentError) : null
      );

      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error recording payment attempt:', error);
      throw error;
    }
  }

  async recordRefund(refundData) {
    try {
      const result = this.statements.insertRefund.run(
        refundData.paymentId || null,
        refundData.userId,
        refundData.stripeRefundId,
        refundData.stripePaymentIntentId,
        refundData.amount,
        refundData.currency || 'usd',
        refundData.reason || 'requested_by_customer',
        refundData.status,
        refundData.metadata ? JSON.stringify(refundData.metadata) : null,
        refundData.adminUserId || null,
        refundData.adminReason || null
      );

      // Log the refund
      this.logAction(
        refundData.userId,
        'refund_recorded',
        'refund',
        refundData.stripeRefundId,
        {
          amount: refundData.amount,
          reason: refundData.reason,
          adminReason: refundData.adminReason
        },
        'system',
        refundData.adminUserId || refundData.userId
      );

      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error recording refund:', error);
      throw error;
    }
  }

  async recordWebhook(webhookData) {
    try {
      const existing = this.statements.getWebhookByEventId.get(webhookData.stripeEventId);
      if (existing) {
        console.log(`Webhook ${webhookData.stripeEventId} already processed, skipping`);
        return existing.id;
      }

      const result = this.statements.insertWebhook.run(
        webhookData.stripeEventId,
        webhookData.eventType,
        webhookData.objectId || null,
        webhookData.userId || null,
        JSON.stringify(webhookData.rawData)
      );

      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error recording webhook:', error);
      throw error;
    }
  }

  async markWebhookProcessed(eventId, error = null) {
    try {
      const result = this.statements.updateWebhookProcessed.run(
        error ? error.message : null,
        eventId
      );
      return result.changes > 0;
    } catch (error) {
      console.error('Error marking webhook as processed:', error);
      throw error;
    }
  }

  async getPaymentAnalytics() {
    try {
      const stats = this.statements.getPaymentStats.get();
      const revenueByPlan = this.statements.getRevenueByPlan.all();

      return {
        stats: {
          ...stats,
          totalRevenueFormatted: `$${((stats.total_revenue || 0) / 100).toFixed(2)}`,
          avgPaymentAmountFormatted: `$${((stats.avg_payment_amount || 0) / 100).toFixed(2)}`,
          successRate: stats.total_payments > 0 ? ((stats.successful_payments / stats.total_payments) * 100).toFixed(1) : 0
        },
        revenueByPlan: revenueByPlan.map(plan => ({
          ...plan,
          totalRevenueFormatted: `$${(plan.total_revenue / 100).toFixed(2)}`,
          avgRevenuePerPayment: `$${(plan.total_revenue / plan.payment_count / 100).toFixed(2)}`
        }))
      };
    } catch (error) {
      console.error('Error getting payment analytics:', error);
      throw error;
    }
  }

  async getUserRefunds(userId) {
    try {
      const refunds = this.statements.getRefundsByUser.all(userId);
      
      return refunds.map(refund => ({
        ...refund,
        metadata: refund.metadata ? JSON.parse(refund.metadata) : null,
        amountFormatted: `$${(refund.amount / 100).toFixed(2)}`,
        originalAmountFormatted: `$${((refund.original_amount || 0) / 100).toFixed(2)}`
      }));
    } catch (error) {
      console.error('Error getting user refunds:', error);
      throw error;
    }
  }

  async cleanupDuplicatePayments() {
    try {
      console.log('🧹 Starting duplicate payment cleanup...');
      
      // Find duplicates by payment_intent_id
      const duplicates = this.db.prepare(`
        SELECT stripe_payment_intent_id, COUNT(*) as count, MIN(id) as keep_id
        FROM payments 
        WHERE stripe_payment_intent_id IS NOT NULL 
        GROUP BY stripe_payment_intent_id 
        HAVING count > 1
      `).all();

      console.log(`🔍 Found ${duplicates.length} sets of duplicate payments`);

      let totalDeleted = 0;
      for (const duplicate of duplicates) {
        // Keep the first payment (lowest ID) and delete the rest
        const deleteResult = this.db.prepare(`
          DELETE FROM payments 
          WHERE stripe_payment_intent_id = ? AND id != ?
        `).run(duplicate.stripe_payment_intent_id, duplicate.keep_id);

        totalDeleted += deleteResult.changes;
        console.log(`🗑️ Deleted ${deleteResult.changes} duplicate payments for intent: ${duplicate.stripe_payment_intent_id}`);
      }

      console.log(`✅ Cleanup completed. Deleted ${totalDeleted} duplicate payment records.`);
      return { duplicates: duplicates.length, deleted: totalDeleted };
    } catch (error) {
      console.error('❌ Error cleaning up duplicate payments:', error);
      throw error;
    }
  }

  // VM Setup Management Methods
  async createVMSetup(userId, planType, vmCount, vmIds) {
    try {
      const setupData = {
        createdAt: new Date().toISOString(),
        vmIds: vmIds,
        planType: planType
      };

      const result = this.statements.insertVMSetup.run(
        userId,
        planType,
        vmCount,
        JSON.stringify(vmIds),
        'pending',
        JSON.stringify(setupData)
      );

      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error creating VM setup:', error);
      throw error;
    }
  }

  async updateVMSetupStatus(userId, status, setupData = {}) {
    try {
      const currentSetup = this.statements.getActiveVMSetup.get(userId);
      if (!currentSetup) {
        throw new Error('No active VM setup found for user');
      }

      const existingData = currentSetup.setup_data ? JSON.parse(currentSetup.setup_data) : {};
      const updatedData = {
        ...existingData,
        ...setupData,
        lastUpdated: new Date().toISOString()
      };

      const result = this.statements.updateVMSetupStatus.run(
        status,
        JSON.stringify(updatedData),
        userId
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating VM setup status:', error);
      throw error;
    }
  }

  async updateVMSetupFile(userId, filePath, setupData = {}) {
    try {
      const currentSetup = this.statements.getActiveVMSetup.get(userId);
      if (!currentSetup) {
        throw new Error('No active VM setup found for user');
      }

      const existingData = currentSetup.setup_data ? JSON.parse(currentSetup.setup_data) : {};
      const updatedData = {
        ...existingData,
        ...setupData,
        fileUploaded: true,
        fileUploadedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      const result = this.statements.updateVMSetupFile.run(
        filePath,
        'file_uploaded',
        JSON.stringify(updatedData),
        userId
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error updating VM setup file:', error);
      throw error;
    }
  }

  async completeVMSetup(userId, setupData = {}) {
    try {
      const currentSetup = this.statements.getActiveVMSetup.get(userId);
      if (!currentSetup) {
        throw new Error('No active VM setup found for user');
      }

      const existingData = currentSetup.setup_data ? JSON.parse(currentSetup.setup_data) : {};
      const completedData = {
        ...existingData,
        ...setupData,
        completed: true,
        completedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      const result = this.statements.completeVMSetup.run(
        JSON.stringify(completedData),
        userId
      );

      return result.changes > 0;
    } catch (error) {
      console.error('Error completing VM setup:', error);
      throw error;
    }
  }

  async getVMSetupByUser(userId) {
    try {
      const setup = this.statements.getVMSetupByUser.get(userId);
      if (!setup) return null;

      // Parse JSON fields
      return {
        ...setup,
        vm_ids: setup.vm_ids ? JSON.parse(setup.vm_ids) : [],
        setup_data: setup.setup_data ? JSON.parse(setup.setup_data) : {}
      };
    } catch (error) {
      console.error('Error getting VM setup:', error);
      throw error;
    }
  }

  async getActiveVMSetup(userId) {
    try {
      const setup = this.statements.getActiveVMSetup.get(userId);
      if (!setup) return null;

      // Parse JSON fields
      return {
        ...setup,
        vm_ids: setup.vm_ids ? JSON.parse(setup.vm_ids) : [],
        setup_data: setup.setup_data ? JSON.parse(setup.setup_data) : {}
      };
    } catch (error) {
      console.error('Error getting active VM setup:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new DatabaseService(); 