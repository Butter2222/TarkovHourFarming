import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  User,
  Search, 
  UserCheck,
  UserX,
  Key,
  Mail,
  Edit3,
  Trash2,
  Shield,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  Copy,
  Eye,
  EyeOff,
  CreditCard,
  Crown,
  UserPlus
} from 'lucide-react';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';

const AdminPanel = () => {
  const { user } = useAuth();
  console.log('AdminPanel render - user:', user?.username, 'role:', user?.role);
  
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // Add user form state
  const [addUserForm, setAddUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'customer',
    vmIds: '',
    subscriptionPlan: 'none',
    subscriptionDuration: '',
    subscriptionDurationType: 'months'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [addUserError, setAddUserError] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel'
  });

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    }
  }, [user]);

  const filterUsers = useCallback(() => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(u => 
        u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.uuid.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Role filter
    if (filterRole !== 'all') {
      filtered = filtered.filter(u => u.role === filterRole);
    }

    // Status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        filtered = filtered.filter(u => u.active);
      } else if (filterStatus === 'suspended') {
        filtered = filtered.filter(u => !u.active);
      }
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterRole, filterStatus]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, filterRole, filterStatus, filterUsers]);

  const fetchUsers = async () => {
    try {
      console.log('Fetching users...');
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Users fetched successfully:', data.users?.length || 0);
        setUsers(data.users || []);
      } else {
        console.error('Failed to fetch users:', response.status);
        setError('Failed to fetch users');
      }
    } catch (error) {
      console.error('Network error fetching users:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId, action, data = {}) => {
    setActionLoading(prev => ({ ...prev, [`${userId}-${action}`]: true }));
    
    try {
      const token = localStorage.getItem('token');
      let url = `/api/admin/users/${userId}/${action}`;
      
      // Special handling for assign-subscription action
      if (action === 'assign-subscription') {
        url = `/api/admin/users/${userId}/assign-subscription`;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show new password if password was reset
        if (action === 'reset-password' && result.newPassword) {
          showToast(`Password reset successfully!\n\nNew password: ${result.newPassword}\n\nPlease provide this to the user securely.`, 'success');
        }
        
        // Show subscription assignment success
        if (action === 'assign-subscription' && result.subscription) {
          const expiryDate = new Date(result.subscription.expiresAt);
          const now = new Date();
          const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
          
          showToast(
            `🎉 Subscription Granted Successfully!\n\n` +
            `Plan: ${result.subscription.plan}\n` +
            `Duration: ${result.subscription.duration}\n` +
            `Expires: ${expiryDate.toLocaleDateString()} (${daysRemaining} days)\n` +
            `Status: Active & Free\n\n` +
            `The user now has full access to their subscription benefits.`,
            'success'
          );
        }
        
        // Show general success message for other actions
        if (action !== 'reset-password' && action !== 'assign-subscription') {
          showToast(result.message || 'Action completed successfully!', 'success');
        }
        
        await fetchUsers(); // Refresh users list
        if (selectedUser && selectedUser.id === userId) {
          // Refresh selected user data
          const updatedUser = users.find(u => u.id === userId);
          if (updatedUser) setSelectedUser(updatedUser);
        }
      } else {
        const errorData = await response.json();
        
        // Enhanced error messaging for subscription assignment
        if (action === 'assign-subscription') {
          showToast(
            `❌ Subscription Assignment Failed\n\n` +
            `Error: ${errorData.error || 'Unknown error occurred'}\n\n` +
            `Please check the user's current subscription status and try again.`,
            'error'
          );
        } else {
          showToast(`Error: ${errorData.error || 'Action failed'}`, 'error');
        }
      }
    } catch (error) {
      // Enhanced error messaging for network issues
      if (action === 'assign-subscription') {
        showToast(
          `❌ Network Error\n\n` +
          `Failed to connect to the server while assigning subscription.\n\n` +
          `Please check your connection and try again.`,
          'error'
        );
      } else {
        showToast('Network error. Please try again.', 'error');
      }
    } finally {
      setActionLoading(prev => ({ ...prev, [`${userId}-${action}`]: false }));
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setAddUserLoading(true);
    setAddUserError('');

    try {
      const token = localStorage.getItem('token');
      const vmIds = addUserForm.vmIds ? addUserForm.vmIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
      
      const userData = {
        ...addUserForm,
        vmIds,
        subscriptionDuration: addUserForm.subscriptionDuration || null,
        subscriptionDurationType: addUserForm.subscriptionDurationType || null
      };

      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      });

      if (response.ok) {
        const result = await response.json();
        
        let successMessage = `User created successfully!\n\nAccount ID: ${result.user.uuid}\nUsername: ${result.user.username}\nTemporary Password: ${addUserForm.password}\n\nPlease provide these credentials to the user securely.`;
        
        // Add subscription info if applicable
        if (addUserForm.subscriptionPlan !== 'none' && addUserForm.subscriptionDuration) {
          successMessage += `\n\nSubscription: ${addUserForm.subscriptionPlan} plan for ${addUserForm.subscriptionDuration} ${addUserForm.subscriptionDurationType} (Free admin grant)`;
        }
        
        showToast(successMessage, 'success');
        
        // Reset form
        setAddUserForm({
          username: '',
          email: '',
          password: '',
          role: 'customer',
          vmIds: '',
          subscriptionPlan: 'none',
          subscriptionDuration: '',
          subscriptionDurationType: 'months'
        });
        
        setShowAddUserModal(false);
        await fetchUsers();
      } else {
        const errorData = await response.json();
        setAddUserError(errorData.error || 'Failed to create user');
      }
    } catch (error) {
      setAddUserError('Network error. Please try again.');
    } finally {
      setAddUserLoading(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAddUserForm(prev => ({ ...prev, password }));
  };

  const copyToClipboard = (text, label) => {
    if (!text) {
      setToast({ show: true, message: 'Account ID not available', type: 'error' });
      return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
      setToast({ show: true, message: `${label} copied to clipboard!`, type: 'success' });
    }).catch(() => {
      setToast({ show: true, message: 'Failed to copy to clipboard', type: 'error' });
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700';
      case 'suspended': return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700';
      case 'banned': return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  const getStatusBadge = (user) => {
    if (!user.active) {
      return <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 text-xs rounded-full transition-colors duration-200">Suspended</span>;
    }
    return <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 text-xs rounded-full transition-colors duration-200">Active</span>;
  };

  const getSubscriptionStatus = (subscription) => {
    try {
      console.log('Processing subscription status:', subscription);
      if (!subscription || subscription.plan === 'none' || !subscription.plan) {
        return <span className="text-gray-800 dark:text-gray-300 text-sm transition-colors duration-200">None</span>;
      }
      
      const isActive = subscription.expiresAt && new Date(subscription.expiresAt) > new Date();
      if (isActive) {
        return <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 text-xs rounded-full">{subscription.plan}</span>;
      } else {
        return <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300 text-xs rounded-full">{subscription.plan} (Expired)</span>;
      }
    } catch (error) {
      console.error('Error processing subscription status:', error, subscription);
      return <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 text-xs rounded-full">Error</span>;
    }
  };

  const showToast = (message, type = 'success') => {
    try {
      console.log('Showing toast:', message, type);
      setToast({ show: true, message, type });
    } catch (error) {
      console.error('Error showing toast:', error);
    }
  };

  const showConfirm = (options) => {
    try {
      console.log('Showing confirm modal:', options);
      setConfirmModal({
        show: true,
        title: options.title || 'Confirm Action',
        message: options.message,
        onConfirm: options.onConfirm,
        type: options.type || 'warning',
        confirmText: options.confirmText || 'Confirm',
        cancelText: options.cancelText || 'Cancel'
      });
    } catch (error) {
      console.error('Error showing confirm modal:', error);
    }
  };

  const hideConfirm = () => {
    setConfirmModal(prev => ({ ...prev, show: false }));
  };

  if (user?.role !== 'admin') {
    console.log('User is not admin, showing access denied:', user?.role);
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  // Safety check for critical errors
  if (error && error.includes('Critical')) {
    console.error('Critical error detected, rendering safe mode');
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-500">System Error. Please refresh the page.</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">User Management</h1>
          <p className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Manage user accounts, permissions, and subscriptions</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setShowAddUserModal(true)}
            className="bg-blue-600 dark:bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center transition-colors duration-200"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search users, emails, or Account IDs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
            />
          </div>

          {/* Role Filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
          >
            <option value="all">All Roles</option>
            <option value="customer">Customers</option>
            <option value="admin">Admins</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          {/* Results Count */}
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
            <Users className="h-4 w-4 mr-2" />
            {filteredUsers.length} user(s)
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 transition-colors duration-200">{error}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-700 transition-colors duration-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Subscription</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">VMs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Last Login</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600 transition-colors duration-200">
                {filteredUsers.map((userItem) => (
                  <tr key={userItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{userItem.username}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{userItem.email}</div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900 px-2 py-1 rounded font-semibold transition-colors duration-200">
                            {userItem.uuid}
                          </span>
                          <button
                            onClick={() => copyToClipboard(userItem.uuid, 'Account ID')}
                            className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                            title="Copy Account ID"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        userItem.role === 'admin' 
                          ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300' 
                          : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                      } transition-colors duration-200`}>
                        {userItem.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(userItem)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getSubscriptionStatus(userItem.subscription)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                      {userItem.vmIds?.length || 0} VMs
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                      {formatDate(userItem.lastLogin)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUser(userItem);
                            setShowUserModal(true);
                          }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors duration-200"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleUserAction(userItem.id, userItem.active ? 'suspend' : 'activate')}
                          disabled={actionLoading[`${userItem.id}-${userItem.active ? 'suspend' : 'activate'}`]}
                          className={`${userItem.active 
                            ? 'text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300' 
                            : 'text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300'
                          } transition-colors duration-200`}
                        >
                          {actionLoading[`${userItem.id}-${userItem.active ? 'suspend' : 'activate'}`] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : userItem.active ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto m-4 transition-colors duration-200">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600 flex justify-between items-center transition-colors duration-200">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200">Add New User</h2>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              {addUserError && (
                <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-3 transition-colors duration-200">
                  <p className="text-red-700 dark:text-red-300 text-sm transition-colors duration-200">{addUserError}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Username *</label>
                  <input
                    type="text"
                    required
                    value={addUserForm.username}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                    placeholder="Enter username"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Email *</label>
                  <input
                    type="email"
                    required
                    value={addUserForm.email}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={addUserForm.password}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                    placeholder="Enter password"
                  />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-1 transition-colors duration-200"
                    >
                  Generate Random Password
                    </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Role</label>
                  <select
                    value={addUserForm.role}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  >
                    <option value="customer">Customer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Subscription Plan</label>
                  <select
                    value={addUserForm.subscriptionPlan}
                    onChange={(e) => setAddUserForm(prev => ({ ...prev, subscriptionPlan: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  >
                    <option value="none">No Plan</option>
                    <option value="Hour Booster">Hour Booster ($12/month value)</option>
                    <option value="KD Drop">KD Drop ($16/month value)</option>
                    <option value="Dual Mode">Dual Mode ($18/month value)</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">VM IDs (comma-separated)</label>
                <input
                  type="text"
                  value={addUserForm.vmIds}
                  onChange={(e) => setAddUserForm(prev => ({ ...prev, vmIds: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  placeholder="e.g., 100, 101, 102"
                />
              </div>
              
              {addUserForm.subscriptionPlan !== 'none' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Subscription Duration *</label>
                      <input
                        type="number"
                        min="1"
                        max="999"
                        required
                        value={addUserForm.subscriptionDuration}
                        onChange={(e) => setAddUserForm(prev => ({ ...prev, subscriptionDuration: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                        placeholder="1"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">Time Period *</label>
                      <select
                        required
                        value={addUserForm.subscriptionDurationType}
                        onChange={(e) => setAddUserForm(prev => ({ ...prev, subscriptionDurationType: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-600 rounded-md p-3 transition-colors duration-200">
                    <div className="flex items-center">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />
                      <span className="text-sm font-medium text-green-900 dark:text-white transition-colors duration-200">Free Administrative Grant</span>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1 transition-colors duration-200">
                      This user will receive a {addUserForm.subscriptionPlan} subscription at no cost for the specified duration.
                    </p>
                  </div>
                </>
              )}
              
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-600 transition-colors duration-200">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addUserLoading}
                  className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 flex items-center transition-colors duration-200"
                >
                  {addUserLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showUserModal && selectedUser && (
        <UserDetailsModal
          user={{
            ...selectedUser,
            subscription: selectedUser.subscription || { plan: 'none', expiresAt: null }
          }}
          onClose={() => setShowUserModal(false)}
          onAction={handleUserAction}
          actionLoading={actionLoading}
          onRefresh={fetchUsers}
          onCopyToClipboard={copyToClipboard}
          showConfirm={showConfirm}
          showToast={showToast}
        />
      )}
      
      {/* Toast Notification */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: '', type: 'success' })}
        />
      )}

      {confirmModal.show && (
        <ConfirmModal
          show={confirmModal.show}
          onClose={hideConfirm}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          type={confirmModal.type}
        />
      )}
    </div>
  );
};

// User Details Modal Component
const UserDetailsModal = ({ user, onClose, onAction, actionLoading, onRefresh, onCopyToClipboard, showConfirm, showToast }) => {
  const [activeTab, setActiveTab] = useState('details');
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    email: user.email,
    role: user.role,
    username: user.username,
    vmIds: user.vmIds ? user.vmIds.join(', ') : '',
    subscriptionPlan: user.subscription?.plan || 'none',
    subscriptionExpiresAt: user.subscription?.expiresAt ? new Date(user.subscription.expiresAt).toISOString().split('T')[0] : ''
  });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  
  // Payment history state
  const [paymentHistory, setPaymentHistory] = useState({ payments: [], refunds: [], loading: true });
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundData, setRefundData] = useState({ amount: '', reason: 'requested_by_customer', adminReason: '' });

  const validateField = (name, value) => {
    const errors = { ...fieldErrors };
    
    switch (name) {
      case 'email':
        if (!value || !/\S+@\S+\.\S+/.test(value)) {
          errors.email = 'Please enter a valid email address';
        } else {
          delete errors.email;
        }
        break;
      case 'username':
        if (!value || value.length < 3) {
          errors.username = 'Username must be at least 3 characters';
        } else if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          errors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
        } else {
          delete errors.username;
        }
        break;
      case 'vmIds':
        if (value) {
          const vmIdArray = value.split(',').map(id => id.trim()).filter(id => id);
          const invalidIds = vmIdArray.filter(id => !/^\d+$/.test(id));
          if (invalidIds.length > 0) {
            errors.vmIds = 'VM IDs must be numbers separated by commas';
          } else {
            delete errors.vmIds;
          }
        } else {
          delete errors.vmIds;
        }
        break;
      default:
        break;
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFieldChange = (name, value) => {
    setEditData(prev => ({ ...prev, [name]: value }));
    validateField(name, value);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      // Validate all fields
      const isValid = ['email', 'username', 'vmIds'].every(field => 
        validateField(field, editData[field])
      );

      if (!isValid) {
        showToast('Please fix the validation errors before saving', 'error');
        return;
      }

      // Process VM IDs
      const vmIds = editData.vmIds 
        ? editData.vmIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        : [];

      // Update basic user details
      await onAction(user.id, 'update', { 
        email: editData.email, 
        role: editData.role,
        username: editData.username,
        vmIds
      });

      showToast('User profile updated successfully', 'success');
    setEditMode(false);
    await onRefresh();
    } catch (error) {
      showToast('Failed to update user profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetEditData = () => {
    setEditData({
      email: user.email,
      role: user.role,
      username: user.username,
      vmIds: user.vmIds ? user.vmIds.join(', ') : '',
      subscriptionPlan: user.subscription?.plan || 'none',
      subscriptionExpiresAt: user.subscription?.expiresAt ? new Date(user.subscription.expiresAt).toISOString().split('T')[0] : ''
    });
    setFieldErrors({});
  };

  const handleCancelEdit = () => {
    resetEditData();
    setEditMode(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700';
      case 'suspended': return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700';
      case 'banned': return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  const getStatusBadge = (user) => {
    if (!user.active) {
      return <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 text-xs rounded-full transition-colors duration-200">Suspended</span>;
    }
    return <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 text-xs rounded-full transition-colors duration-200">Active</span>;
  };

  const getRoleIcon = (role) => {
    return role === 'admin' ? <Crown className="h-4 w-4 text-yellow-500" /> : <Users className="h-4 w-4 text-blue-500" />;
  };

  const tabs = [
    { id: 'details', label: 'Profile Details', icon: <Edit3 className="h-4 w-4" /> },
    { id: 'subscription', label: 'Subscription', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'payments', label: 'Payment History', icon: <CreditCard className="h-4 w-4" /> },
    { id: 'vms', label: 'Virtual Machines', icon: <Shield className="h-4 w-4" /> },
    { id: 'actions', label: 'Account Actions', icon: <AlertTriangle className="h-4 w-4" /> }
  ];

  // Fetch payment history
  const fetchPaymentHistory = async () => {
    try {
      setPaymentHistory(prev => ({ ...prev, loading: true }));
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/users/${user.id}/payment-history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPaymentHistory({
          payments: data.payments || [],
          refunds: data.refunds || [],
          loading: false
        });
      } else {
        console.error('Failed to fetch payment history');
        setPaymentHistory(prev => ({ ...prev, loading: false }));
        showToast('Failed to fetch payment history', 'error');
      }
    } catch (error) {
      console.error('Error fetching payment history:', error);
      setPaymentHistory(prev => ({ ...prev, loading: false }));
      showToast('Error fetching payment history', 'error');
    }
  };

  // Handle refund processing
  const handleProcessRefund = async (e) => {
    e.preventDefault();
    
    try {
      console.log('🔄 Processing refund on frontend:', {
        selectedPayment,
        refundData,
        userId: user.id
      });

      const token = localStorage.getItem('token');
      
      // Calculate refund amount properly
      const refundAmount = refundData.amount ? parseFloat(refundData.amount) : (selectedPayment.amount / 100);
      
      console.log('💰 Refund amount calculation:', {
        inputAmount: refundData.amount,
        calculatedAmount: refundAmount,
        originalAmount: selectedPayment.amount,
        originalAmountDollars: selectedPayment.amount / 100
      });

      const requestBody = {
        paymentId: selectedPayment.id,
        amount: refundAmount, // Send as dollars, backend will convert to cents
        reason: refundData.reason,
        adminReason: refundData.adminReason
      };

      console.log('📤 Sending refund request:', requestBody);

      const response = await fetch(`/api/admin/users/${user.id}/process-refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('📥 Refund response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Refund response data:', data);
        showToast(data.message || 'Refund processed successfully', 'success');
        setShowRefundModal(false);
        setSelectedPayment(null);
        setRefundData({ amount: '', reason: 'requested_by_customer', adminReason: '' });
        await fetchPaymentHistory(); // Refresh payment history
      } else {
        const errorText = await response.text();
        console.error('❌ Refund error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText };
        }
        showToast(errorData.error || 'Failed to process refund', 'error');
      }
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      showToast('Network error while processing refund: ' + error.message, 'error');
    }
  };

  // Load payment history when tab is selected
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'payments' && paymentHistory.loading) {
      fetchPaymentHistory();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[85vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900 transition-colors duration-200">
          <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  {getRoleIcon(user.role)}
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200">{user.username}</h2>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full border ${getStatusColor(user.status || 'active')}`}>
                    {(user.status || 'active').toUpperCase()}
                  </span>
                  <span className="text-sm font-mono text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-full font-semibold transition-colors duration-200">
                {user.uuid}
              </span>
              <button
                onClick={() => onCopyToClipboard(user.uuid, 'Account ID')}
                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                title="Copy Account ID"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center transition-colors duration-200">
                <Mail className="h-3 w-3 mr-1" />
                {user.email}
              </p>
          </div>
          <button
            onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
          >
            <XCircle className="h-6 w-6" />
          </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
          <nav className="flex space-x-1 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`py-3 px-4 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 200px)' }}>
          {activeTab === 'details' && (
            <div className="space-y-6">
              {!editMode ? (
                // View Mode
                <div className="space-y-6">
                  {/* Profile Overview */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white transition-colors duration-200 mb-4 flex items-center">
                      <User className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                      Profile Overview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Username</label>
                          <p className="text-gray-900 dark:text-white font-medium">{user.username}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Email Address</label>
                          <p className="text-gray-900 dark:text-white">{user.email}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Account Role</label>
                          <div className="flex items-center space-x-2">
                            {getRoleIcon(user.role)}
                            <p className="text-gray-900 dark:text-white capitalize font-medium">{user.role}</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Account Status</label>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(user.status || 'active')}`}>
                            <div className="w-2 h-2 rounded-full bg-current mr-2"></div>
                            {(user.status || 'active').charAt(0).toUpperCase() + (user.status || 'active').slice(1)}
                          </span>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Assigned VMs</label>
                          <p className="text-gray-900 dark:text-white font-medium">{user.vmIds?.length || 0} Virtual Machines</p>
                          {user.vmIds && user.vmIds.length > 0 && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">VM IDs: {user.vmIds.join(', ')}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Member Since</label>
                          <p className="text-gray-900 dark:text-white">{new Date(user.createdAt).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Account Activity */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white transition-colors duration-200 mb-4 flex items-center">
                      <Calendar className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
                      Account Activity
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Last Login</label>
                        <p className="text-gray-900 dark:text-white">
                          {user.lastLogin 
                            ? new Date(user.lastLogin).toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Never'
                          }
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Account ID</label>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-600 px-2 py-1 rounded transition-colors duration-200">{user.uuid}</span>
                          <button
                            onClick={() => onCopyToClipboard(user.uuid, 'Account ID')}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-200"
                            title="Copy Account ID"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => setEditMode(true)}
                      className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 flex items-center space-x-2 transition-colors duration-200 font-medium"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span>Edit Profile</span>
                    </button>
                  </div>
                </div>
              ) : (
                // Edit Mode
                <div className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4 transition-colors duration-200">
                    <div className="flex items-center space-x-2">
                      <Edit3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <h3 className="text-lg font-medium text-blue-900 dark:text-white transition-colors duration-200">Edit Profile Details</h3>
                    </div>
                    <p className="text-blue-700 dark:text-blue-300 text-sm mt-1 transition-colors duration-200">Update customer information and account settings below.</p>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
                    {/* Basic Information */}
                    <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-6 space-y-6 transition-colors duration-200">
                      <h4 className="text-md font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2 transition-colors duration-200">Basic Information</h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                            Username *
                          </label>
                          <input
                            type="text"
                            value={editData.username}
                            onChange={(e) => handleFieldChange('username', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 bg-white dark:bg-gray-600 text-gray-900 dark:text-white ${
                              fieldErrors.username 
                                ? 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500' 
                                : 'border-gray-300 dark:border-gray-500 focus:border-blue-500'
                            }`}
                            placeholder="Enter username"
                          />
                          {fieldErrors.username && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1 transition-colors duration-200">{fieldErrors.username}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                            Email Address *
                          </label>
                    <input
                      type="email"
                      value={editData.email}
                            onChange={(e) => handleFieldChange('email', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 bg-white dark:bg-gray-600 text-gray-900 dark:text-white ${
                              fieldErrors.email 
                                ? 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500' 
                                : 'border-gray-300 dark:border-gray-500 focus:border-blue-500'
                            }`}
                            placeholder="Enter email address"
                    />
                          {fieldErrors.email && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1 transition-colors duration-200">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                            Account Role
                          </label>
                    <select
                      value={editData.role}
                            onChange={(e) => handleFieldChange('role', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-200"
                    >
                      <option value="customer">Customer</option>
                      <option value="admin">Admin</option>
                    </select>
                </div>

                <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                            VM Assignments
                          </label>
                          <input
                            type="text"
                            value={editData.vmIds}
                            onChange={(e) => handleFieldChange('vmIds', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 bg-white dark:bg-gray-600 text-gray-900 dark:text-white ${
                              fieldErrors.vmIds 
                                ? 'border-red-300 dark:border-red-600 focus:border-red-500 focus:ring-red-500' 
                                : 'border-gray-300 dark:border-gray-500 focus:border-blue-500'
                            }`}
                            placeholder="Enter VM IDs separated by commas (e.g., 100, 101, 102)"
                          />
                          {fieldErrors.vmIds && (
                            <p className="text-red-600 dark:text-red-400 text-sm mt-1 transition-colors duration-200">{fieldErrors.vmIds}</p>
                          )}
                          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 transition-colors duration-200">
                            Enter VM IDs that this user can access, separated by commas
                          </p>
                </div>
                </div>
              </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-600 transition-colors duration-200">
                    <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="px-6 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 transition-colors duration-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={saving || Object.keys(fieldErrors).length > 0}
                        className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2 transition-colors duration-200 font-medium"
                    >
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Saving...</span>
                  </>
                ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            <span>Save Changes</span>
                          </>
                        )}
                      </button>
              </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeTab === 'subscription' && (
            <div className="space-y-6">
              {/* Current Subscription Status */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4 transition-colors duration-200">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center transition-colors duration-200">
                  <Crown className="h-5 w-5 text-yellow-500 mr-2" />
                  Current Subscription Status
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-700 rounded-md p-3 border border-gray-200 dark:border-gray-600 transition-colors duration-200">
                    <span className="text-sm text-gray-600 dark:text-gray-400 block transition-colors duration-200">Plan</span>
                    <span className="font-semibold text-lg text-gray-900 dark:text-white transition-colors duration-200">
                      {user?.subscription?.plan || 'No Plan'}
                    </span>
                    {user?.subscription?.plan && user.subscription.plan !== 'none' && (
                      <div className="mt-1">
                        <span className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${
                          user?.subscription?.expiresAt && new Date(user.subscription.expiresAt) > new Date()
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
                        }`}>
                          {user?.subscription?.expiresAt && new Date(user.subscription.expiresAt) > new Date()
                            ? 'Active'
                            : 'Expired'
                          }
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded-md p-3 border border-gray-200 dark:border-gray-600 transition-colors duration-200">
                    <span className="text-sm text-gray-600 dark:text-gray-400 block transition-colors duration-200">Expires</span>
                    <span className="font-semibold text-lg text-gray-900 dark:text-white transition-colors duration-200">
                      {user?.subscription?.expiresAt 
                        ? new Date(user.subscription.expiresAt).toLocaleDateString() 
                        : 'N/A'}
                    </span>
                    {user?.subscription?.expiresAt && (
                      <div className="mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400 transition-colors duration-200">
                          {(() => {
                            try {
                              const expiry = new Date(user.subscription.expiresAt);
                              const now = new Date();
                              const diffTime = expiry - now;
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              
                              if (diffDays < 0) return `Expired ${Math.abs(diffDays)} days ago`;
                              if (diffDays === 0) return 'Expires today';
                              if (diffDays === 1) return 'Expires tomorrow';
                              return `${diffDays} days remaining`;
                            } catch (error) {
                              console.error('Error calculating subscription days:', error);
                              return 'Date error';
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Custom Subscription Assignment */}
              <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors duration-200">
                <div className="border-b border-gray-200 dark:border-gray-600 px-4 py-3 transition-colors duration-200">
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center transition-colors duration-200">
                    <CreditCard className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                    Custom Subscription Assignment
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">Configure a custom subscription with specific duration and plan</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    const plan = formData.get('plan');
                    const duration = parseInt(formData.get('duration'));
                    const durationType = formData.get('durationType');
                    
                    if (!plan || !duration || !durationType) {
                      showToast('Please fill in all fields', 'error');
                      return;
                    }
                    
                    const expiryDate = new Date();
                    if (durationType === 'days') expiryDate.setDate(expiryDate.getDate() + duration);
                    else if (durationType === 'weeks') expiryDate.setDate(expiryDate.getDate() + (duration * 7));
                    else if (durationType === 'months') expiryDate.setMonth(expiryDate.getMonth() + duration);
                    else if (durationType === 'years') expiryDate.setFullYear(expiryDate.getFullYear() + duration);
                    
                    showConfirm({
                      title: 'Assign Custom Subscription',
                      message: `Assign ${plan} subscription for ${duration} ${durationType} to ${user.username}?\n\nExpires: ${expiryDate.toLocaleDateString()}\nCost: Free (Admin Grant)`,
                      type: 'subscription',
                      confirmText: 'Assign Subscription',
                      onConfirm: () => onAction(user.id, 'assign-subscription', { plan, duration, durationType })
                    });
                  }}
                  className="p-4 space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        Subscription Plan *
                      </label>
                      <select
                        name="plan"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-200"
                      >
                        <option value="">No Subscription</option>
                        <option value="Hour Booster">Hour Booster ($12/month value)</option>
                        <option value="KD Drop">KD Drop ($16/month value)</option>
                        <option value="Dual Mode">Dual Mode ($18/month value)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        Duration *
                      </label>
                      <input
                        type="number"
                        name="duration"
                        min="1"
                        max="999"
                        required
                        placeholder="1"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        Time Period *
                      </label>
                      <select
                        name="durationType"
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-600 text-gray-900 dark:text-white transition-colors duration-200"
                      >
                        <option value="">Select period...</option>
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                        <option value="years">Years</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-md p-3 transition-colors duration-200">
                    <div className="flex items-center">
                      <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                      <span className="text-sm font-medium text-blue-900 dark:text-white transition-colors duration-200">Free Administrative Grant</span>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 transition-colors duration-200">
                      This subscription will be granted at no cost. The user will receive full access to the selected plan.
                    </p>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={actionLoading[`${user.id}-assign-subscription`]}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white px-6 py-3 rounded-md hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-indigo-600 disabled:opacity-50 flex items-center justify-center transition-all duration-200 font-medium"
                  >
                    {actionLoading[`${user.id}-assign-subscription`] ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Assigning Subscription...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-5 w-5 mr-2" />
                        Assign Custom Subscription
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* Payment History Header */}
              <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4 transition-colors duration-200">
                <h4 className="font-medium text-blue-900 dark:text-white mb-2 flex items-center transition-colors duration-200">
                  <CreditCard className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                  Payment History & Billing
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 transition-colors duration-200">
                  View payment transactions, subscription history, and process refunds for this customer.
                </p>
              </div>

              {paymentHistory.loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                </div>
              ) : (
                <>
                  {/* Payments Table */}
                  <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden transition-colors duration-200">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-600">
                      <h5 className="font-medium text-gray-900 dark:text-white transition-colors duration-200">Payment Transactions</h5>
                    </div>
                    
                    {paymentHistory.payments.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No payment history found</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                          <thead className="bg-gray-50 dark:bg-gray-600">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Plan</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Method</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                            {paymentHistory.payments.map((payment) => (
                              <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200">
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                  {new Date(payment.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                  {payment.plan_name || 'Unknown'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                  {payment.amountFormatted}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    payment.status === 'succeeded' 
                                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300' 
                                      : payment.status === 'failed'
                                      ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
                                      : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300'
                                  }`}>
                                    {payment.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {payment.payment_method || 'Card'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                  {payment.status === 'succeeded' && (
                                    <button
                                      onClick={() => {
                                        setSelectedPayment(payment);
                                        setRefundData({ 
                                          amount: (payment.amount / 100).toFixed(2), 
                                          reason: 'requested_by_customer', 
                                          adminReason: '' 
                                        });
                                        setShowRefundModal(true);
                                      }}
                                      className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 font-medium transition-colors duration-200"
                                    >
                                      Refund
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Refunds Table */}
                  {paymentHistory.refunds.length > 0 && (
                    <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden transition-colors duration-200">
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-600">
                        <h5 className="font-medium text-gray-900 dark:text-white transition-colors duration-200">Refund History</h5>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                          <thead className="bg-gray-50 dark:bg-gray-600">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Reason</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Admin Reason</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                            {paymentHistory.refunds.map((refund) => (
                              <tr key={refund.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors duration-200">
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                  {new Date(refund.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-red-600 dark:text-red-400">
                                  -{refund.amountFormatted}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                  {refund.reason}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    refund.status === 'succeeded' 
                                      ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300' 
                                      : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-300'
                                  }`}>
                                    {refund.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {refund.admin_reason || 'N/A'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'vms' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white transition-colors duration-200">Assigned Virtual Machines</h4>
              {user.vmIds && user.vmIds.length > 0 ? (
                <div className="grid grid-cols-3 gap-4">
                  {user.vmIds.map((vmId) => (
                    <div key={vmId} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center transition-colors duration-200">
                      <p className="font-medium text-gray-900 dark:text-white transition-colors duration-200">VM {vmId}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 transition-colors duration-200">No VMs assigned</p>
              )}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Admin Actions</h4>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => onAction(user.id, 'reset-password')}
                  disabled={actionLoading[`${user.id}-reset-password`]}
                  className="flex items-center justify-center px-4 py-3 bg-yellow-600 dark:bg-yellow-500 text-white rounded-md hover:bg-yellow-700 dark:hover:bg-yellow-600 disabled:opacity-50 transition-colors duration-200"
                >
                  {actionLoading[`${user.id}-reset-password`] ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Reset Password
                </button>

                <button
                  onClick={() => onAction(user.id, user.active ? 'suspend' : 'activate')}
                  disabled={actionLoading[`${user.id}-${user.active ? 'suspend' : 'activate'}`]}
                  className={`flex items-center justify-center px-4 py-3 rounded-md disabled:opacity-50 transition-colors duration-200 ${
                    user.active 
                      ? 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600' 
                      : 'bg-green-600 dark:bg-green-500 text-white hover:bg-green-700 dark:hover:bg-green-600'
                  }`}
                >
                  {actionLoading[`${user.id}-${user.active ? 'suspend' : 'activate'}`] ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : user.active ? (
                    <UserX className="h-4 w-4 mr-2" />
                  ) : (
                    <UserCheck className="h-4 w-4 mr-2" />
                  )}
                  {user.active ? 'Suspend User' : 'Activate User'}
                </button>

                <button
                  onClick={() => onAction(user.id, 'send-email')}
                  disabled={actionLoading[`${user.id}-send-email`]}
                  className="flex items-center justify-center px-4 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors duration-200"
                >
                  {actionLoading[`${user.id}-send-email`] ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  Send Email
                </button>

                <button
                  onClick={() => {
                    showConfirm({
                      title: 'Delete User',
                      message: 'Are you sure you want to delete this user? This action cannot be undone.',
                      type: 'danger',
                      confirmText: 'Delete',
                      onConfirm: () => onAction(user.id, 'delete')
                    });
                  }}
                  disabled={actionLoading[`${user.id}-delete`]}
                  className="flex items-center justify-center px-4 py-3 bg-red-600 dark:bg-red-500 text-white rounded-md hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors duration-200"
                >
                  {actionLoading[`${user.id}-delete`] ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete User
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full mx-4 shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Process Refund</h3>
            </div>
            
            <form onSubmit={handleProcessRefund} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Payment Details
                </label>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded border text-sm">
                  <p><strong>Date:</strong> {new Date(selectedPayment.created_at).toLocaleDateString()}</p>
                  <p><strong>Amount:</strong> ${(selectedPayment.amount / 100).toFixed(2)}</p>
                  <p><strong>Plan:</strong> {selectedPayment.plan_name}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Refund Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={(selectedPayment.amount / 100).toFixed(2)}
                  value={refundData.amount}
                  onChange={(e) => setRefundData(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter refund amount"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Maximum: ${(selectedPayment.amount / 100).toFixed(2)}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Refund Reason
                </label>
                <select
                  value={refundData.reason}
                  onChange={(e) => setRefundData(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="requested_by_customer">Requested by Customer</option>
                  <option value="duplicate">Duplicate Payment</option>
                  <option value="fraudulent">Fraudulent Transaction</option>
                  <option value="subscription_canceled">Subscription Canceled</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Admin Notes
                </label>
                <textarea
                  value={refundData.adminReason}
                  onChange={(e) => setRefundData(prev => ({ ...prev, adminReason: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows="3"
                  placeholder="Internal reason for refund (optional)"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRefundModal(false);
                    setSelectedPayment(null);
                    setRefundData({ amount: '', reason: 'requested_by_customer', adminReason: '' });
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors duration-200 flex items-center"
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Process Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel; 