const bcrypt = require('bcryptjs');

// In a production environment, this would be a database
// For demo purposes, we'll use an in-memory store with hashed passwords

const users = [
  {
    id: 1,
    username: 'customer1',
    email: 'customer1@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password123'
    vmIds: [100, 101], // VMs assigned to this customer
    active: true,
    createdAt: new Date('2023-01-01'),
    subscription: {
      plan: 'basic',
      expiresAt: new Date('2024-12-31')
    }
  },
  {
    id: 2,
    username: 'customer2',
    email: 'customer2@example.com',
    password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'password123'
    vmIds: [102],
    active: true,
    createdAt: new Date('2023-02-01'),
    subscription: {
      plan: 'premium',
      expiresAt: new Date('2024-12-31')
    }
  },
  {
    id: 3,
    username: 'admin',
    email: 'admin@example.com',
    password: '$2a$10$9OKWnzUmlImKYWKELBJJPOzWTmPoEEy0LnfSHfj1/C6f3PpjFXCy.', // 'admin123'
    vmIds: [], // Admin can see all VMs
    role: 'admin',
    active: true,
    createdAt: new Date('2023-01-01')
  }
];

// Helper function to create a new user with hashed password
const createUser = async (userData) => {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const newUser = {
    id: users.length + 1,
    ...userData,
    password: hashedPassword,
    active: true,
    createdAt: new Date(),
    vmIds: userData.vmIds || []
  };
  users.push(newUser);
  return newUser;
};

// Helper function to find user by username
const findUserByUsername = (username) => {
  return users.find(user => user.username === username && user.active);
};

// Helper function to find user by ID
const findUserById = (id) => {
  return users.find(user => user.id === id && user.active);
};

// Helper function to verify password
const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

// Helper function to get user's VM IDs
const getUserVMIds = (userId) => {
  const user = findUserById(userId);
  return user ? user.vmIds : [];
};

// Helper function to check if user can access VM
const canAccessVM = (userId, vmId) => {
  const user = findUserById(userId);
  if (!user) return false;
  
  // Admin can access all VMs
  if (user.role === 'admin') return true;
  
  // Regular users can only access their assigned VMs
  return user.vmIds.includes(parseInt(vmId));
};

module.exports = {
  users,
  createUser,
  findUserByUsername,
  findUserById,
  verifyPassword,
  getUserVMIds,
  canAccessVM
}; 