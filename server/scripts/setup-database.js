const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.db');
const db = new Database(dbPath);

console.log('🗄️  Setting up SQLite database...');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const createTables = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'customer',
  active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  subscription_plan TEXT,
  subscription_expires_at DATETIME
);

-- VM assignments table
CREATE TABLE IF NOT EXISTS vm_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vm_id INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE(user_id, vm_id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Sessions table (for tracking active sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_vm_assignments_user_id ON vm_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_vm_assignments_vm_id ON vm_assignments(vm_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
`;

// Execute table creation
db.exec(createTables);

console.log('Database tables created successfully');

// Create demo users with proper bcrypt hashes
async function createDemoUsers() {
  console.log('👥 Creating demo users...');
  
  const { v4: uuidv4 } = require('uuid');
  
  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (uuid, username, email, password_hash, role, subscription_plan, subscription_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertVMAssignment = db.prepare(`
    INSERT OR REPLACE INTO vm_assignments (user_id, vm_id) VALUES (?, ?)
  `);
  
  try {
    // Hash passwords properly
    const customerPassword = await bcrypt.hash('password123', 12);
    const adminPassword = await bcrypt.hash('admin123', 12);
    
    // Create customer1
    const customer1Result = insertUser.run(
      uuidv4(),
      'customer1',
      'customer1@example.com',
      customerPassword,
      'customer',
      'basic',
      new Date('2024-12-31').toISOString()
    );
    
    // Assign VMs to customer1
    insertVMAssignment.run(customer1Result.lastInsertRowid, 100);
    insertVMAssignment.run(customer1Result.lastInsertRowid, 101);
    
    // Create customer2
    const customer2Result = insertUser.run(
      uuidv4(),
      'customer2',
      'customer2@example.com',
      customerPassword,
      'customer',
      'premium',
      new Date('2024-12-31').toISOString()
    );
    
    // Assign VM to customer2
    insertVMAssignment.run(customer2Result.lastInsertRowid, 102);
    
    // Create admin
    insertUser.run(
      uuidv4(),
      'admin',
      'admin@example.com',
      adminPassword,
      'admin',
      null,
      null
    );
    
    console.log('✅ Demo users created successfully');
    console.log('📝 Demo credentials:');
    console.log('   Customer: customer1 / password123 (VMs: 100, 101)');
    console.log('   Customer: customer2 / password123 (VM: 102)');
    console.log('   Admin: admin / admin123 (All VMs)');
    
  } catch (error) {
    console.error('❌ Error creating demo users:', error);
  }
}

// Create demo users
createDemoUsers().then(() => {
  console.log('Database setup complete!');
  console.log('Database location:', dbPath);
  db.close();
}).catch(console.error); 