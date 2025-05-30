// TEMPORARY: Simple users with plain text passwords for testing
// DO NOT use in production!

const users = [
  {
    id: 1,
    username: 'customer1',
    email: 'customer1@example.com',
    password: 'password123', // Plain text for testing
    vmIds: [100, 101],
    active: true,
    createdAt: new Date('2023-01-01'),
    subscription: {
      plan: 'basic',
      expiresAt: new Date('2024-12-31')
    }
  },
  {
    id: 3,
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123', // Plain text for testing
    vmIds: [],
    role: 'admin',
    active: true,
    createdAt: new Date('2023-01-01')
  }
];

const findUserByUsername = (username) => {
  return users.find(user => user.username === username && user.active);
};

const findUserById = (id) => {
  return users.find(user => user.id === id && user.active);
};

// Simple password verification for testing
const verifyPassword = async (plainPassword, storedPassword) => {
  return plainPassword === storedPassword;
};

const getUserVMIds = (userId) => {
  const user = findUserById(userId);
  return user ? user.vmIds : [];
};

const canAccessVM = (userId, vmId) => {
  const user = findUserById(userId);
  if (!user) return false;
  
  if (user.role === 'admin') return true;
  return user.vmIds.includes(parseInt(vmId));
};

module.exports = {
  users,
  findUserByUsername,
  findUserById,
  verifyPassword,
  getUserVMIds,
  canAccessVM
}; 