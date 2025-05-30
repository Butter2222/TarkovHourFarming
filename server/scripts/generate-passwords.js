const bcrypt = require('bcryptjs');

async function generatePasswords() {
  const passwords = {
    'password123': await bcrypt.hash('password123', 10),
    'admin123': await bcrypt.hash('admin123', 10)
  };

  console.log('Generated password hashes:');
  console.log('password123:', passwords['password123']);
  console.log('admin123:', passwords['admin123']);
  
  console.log('\nUpdate server/data/users.js with these hashes');
}

generatePasswords().catch(console.error); 