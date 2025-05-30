const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

// Connect to database
const dbPath = path.join(__dirname, '../data/database.db');
const db = new Database(dbPath);

// Function to generate custom account ID (6-character alphanumeric like 91Z5IP)
function generateAccountId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function createAdmin() {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node create-admin.js <username> <password> [email] [account-id]');
    console.log('Example: node create-admin.js admin mypassword admin@example.com');
    console.log('Example: node create-admin.js admin mypassword admin@example.com 91Z5IP');
    process.exit(1);
  }
  
  const username = args[0];
  const password = args[1];
  const email = args[2] || `${username}@example.com`;
  const accountId = args[3] || generateAccountId();
  
  console.log(`Creating admin account: ${username}`);
  console.log(`Email: ${email}`);
  console.log(`Account ID: ${accountId}`);
  
  try {
    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Insert admin user
    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (
        uuid, username, email, password_hash, role, subscription_plan, subscription_expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = insertUser.run(
      accountId,
      username,
      email,
      passwordHash,
      'admin',
      null,
      null
    );
    
    if (result.changes > 0) {
      console.log('✅ Admin account created/updated successfully!');
      console.log(`📝 Credentials: ${username} / ${password}`);
      console.log(`🆔 Account ID: ${accountId}`);
    } else {
      console.log('❌ Failed to create admin account');
    }
    
  } catch (error) {
    console.error('❌ Error creating admin account:', error.message);
  } finally {
    db.close();
  }
}

createAdmin(); 