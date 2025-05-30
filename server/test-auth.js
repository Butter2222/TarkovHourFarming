const bcrypt = require('bcryptjs');
const { findUserByUsername, verifyPassword } = require('./data/users');

async function testAuth() {
  console.log('=== Testing Authentication ===\n');
  
  // Test customer1
  console.log('Testing customer1...');
  const customer1 = findUserByUsername('customer1');
  if (customer1) {
    console.log('✅ Found user:', customer1.username);
    console.log('📧 Email:', customer1.email);
    console.log('🔑 Password hash:', customer1.password);
    
    const isValid = await verifyPassword('password123', customer1.password);
    console.log('✅ Password verification:', isValid ? 'SUCCESS' : 'FAILED');
  } else {
    console.log('❌ User not found');
  }
  
  console.log('\n' + '-'.repeat(40) + '\n');
  
  // Test admin
  console.log('Testing admin...');
  const admin = findUserByUsername('admin');
  if (admin) {
    console.log('✅ Found user:', admin.username);
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password hash:', admin.password);
    
    const isValid = await verifyPassword('admin123', admin.password);
    console.log('✅ Password verification:', isValid ? 'SUCCESS' : 'FAILED');
  } else {
    console.log('❌ User not found');
  }
  
  console.log('\n=== Test Complete ===');
}

testAuth().catch(console.error); 