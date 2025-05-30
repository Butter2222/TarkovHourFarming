const readline = require('readline');
const db = require('../services/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createUser() {
  console.log('User Creation Tool\n');
  
  try {
    const username = await question('Username: ');
    const email = await question('Email: ');
    const password = await question('Password: ');
    const role = await question('Role (customer/admin) [customer]: ') || 'customer';
    
    let vmIds = [];
    if (role === 'customer') {
      const vmIdsInput = await question('VM IDs (comma-separated, e.g., 100,101): ');
      if (vmIdsInput.trim()) {
        vmIds = vmIdsInput.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      }
    }
    
    let subscriptionPlan = null;
    let subscriptionExpiresAt = null;
    
    if (role === 'customer') {
      subscriptionPlan = await question('Subscription plan (basic/premium/enterprise) [basic]: ') || 'basic';
      const expiryInput = await question('Subscription expires (YYYY-MM-DD) [2024-12-31]: ') || '2024-12-31';
      subscriptionExpiresAt = new Date(expiryInput).toISOString();
    }
    
    console.log('\nUser Details:');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`Role: ${role}`);
    console.log(`VM IDs: ${vmIds.length > 0 ? vmIds.join(', ') : 'None'}`);
    console.log(`Subscription: ${subscriptionPlan || 'None'}`);
    console.log(`Expires: ${subscriptionExpiresAt || 'N/A'}`);
    
    const confirm = await question('\nCreate this user? (y/n): ');
    
    if (confirm.toLowerCase() !== 'y') {
      console.log('User creation cancelled');
      rl.close();
      return;
    }
    
    const newUser = await db.createUser({
      username,
      email,
      password,
      role,
      vmIds,
      subscriptionPlan,
      subscriptionExpiresAt
    });
    
    console.log('\nUser created successfully!');
    console.log(`User ID: ${newUser.id}`);
    console.log(`UUID: ${newUser.uuid}`);
    console.log('\nThe user can now login with:');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    
    if (vmIds.length > 0) {
      console.log(`\nAssigned VMs: ${vmIds.join(', ')}`);
    }
    
  } catch (error) {
    console.error('\nError creating user:', error.message);
  } finally {
    rl.close();
  }
}

createUser(); 