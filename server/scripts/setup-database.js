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

// Function to generate custom account ID (6-character alphanumeric like 91Z5IP)
function generateAccountId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create admin user only
async function createAdminUser() {
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
      uuid, username, email, password_hash, role, subscription_plan, subscription_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  try {
    // Hash admin password
    const adminPassword = await bcrypt.hash('admin123', 12);
    
    // Create admin account with custom account ID
    const adminResult = insertUser.run(
      generateAccountId(),
      'admin',
      'admin@example.com',
      adminPassword,
      'admin',
      null,
      null
    );
    
    if (adminResult.changes > 0) {
      console.log('✅ Admin account created successfully');
      console.log('📝 Admin credentials: admin / admin123');
    } else {
      console.log('ℹ️  Admin account already exists');
    }
    
  } catch (error) {
    console.error('❌ Error creating admin account:', error);
  }
}

// Create admin user
createAdminUser().then(() => {
  console.log('Database setup complete!');
  console.log('Database location:', dbPath);
  db.close();
}).catch(console.error); 