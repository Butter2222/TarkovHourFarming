require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '../.env');

console.log('🔍 Checking environment configuration...\n');

// Check if .env file exists
if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found');
  process.exit(1);
}

// Read current .env content
const envContent = fs.readFileSync(envPath, 'utf8');
console.log('📄 Current .env file content:');
console.log('----------------------------------------');
console.log(envContent);
console.log('----------------------------------------\n');

// Check for required variables
const requiredVars = ['JWT_SECRET', 'PROXMOX_HOST', 'PROXMOX_USERNAME', 'PROXMOX_PASSWORD'];
const missingVars = [];

console.log('🔑 Checking required environment variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (!value || value.trim() === '') {
    console.log(`❌ ${varName}: Missing or empty`);
    missingVars.push(varName);
  } else {
    console.log(`✅ ${varName}: Set (${varName === 'JWT_SECRET' || varName.includes('PASSWORD') ? '[HIDDEN]' : value})`);
  }
});

// If JWT_SECRET is missing, generate one and add it
if (missingVars.includes('JWT_SECRET')) {
  console.log('\n🔧 Generating JWT_SECRET...');
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  
  let newEnvContent = envContent;
  if (envContent.includes('JWT_SECRET=')) {
    // Replace existing empty JWT_SECRET
    newEnvContent = envContent.replace(/JWT_SECRET=.*/, `JWT_SECRET=${jwtSecret}`);
  } else {
    // Add JWT_SECRET to the end
    newEnvContent += `\n# JWT Configuration\nJWT_SECRET=${jwtSecret}\nJWT_EXPIRE=24h\n`;
  }
  
  // Write updated .env file
  fs.writeFileSync(envPath, newEnvContent);
  console.log('✅ JWT_SECRET added to .env file');
  console.log('⚠️  You need to restart PM2 for changes to take effect:');
  console.log('   pm2 restart all');
}

if (missingVars.length === 0) {
  console.log('\n✅ All required environment variables are set!');
} else {
  console.log('\n❌ Missing variables need to be configured in .env file');
}

console.log('\n💡 If you still get JWT errors after restarting PM2, the issue might be:');
console.log('   1. .env file not being loaded properly');
console.log('   2. PM2 not picking up environment changes');
console.log('   3. Different .env file location'); 