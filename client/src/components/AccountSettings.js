import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  User,
  Key,
  Settings,
  Shield,
  Eye,
  EyeOff,
  Save,
  AlertTriangle,
  Clock,
  Globe,
  Moon,
  Sun,
  Copy,
  Calendar,
  Crown,
  Loader2,
  Trash2
} from 'lucide-react';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';

const AccountSettings = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [confirmModal, setConfirmModal] = useState({ show: false, title: '', message: '', onConfirm: () => {} });

  // Profile settings state
  const [profileData, setProfileData] = useState({
    username: user?.username || '',
    email: user?.email || ''
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);

  // Security settings state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  // Preferences state
  const [preferences, setPreferences] = useState({
    emailNotifications: user?.preferences?.emailNotifications ?? true,
    securityNotifications: user?.preferences?.securityNotifications ?? true,
    marketingEmails: user?.preferences?.marketingEmails ?? false,
    theme: theme || 'light',
    language: user?.preferences?.language || 'en'
  });
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData({
        email: user.email || '',
        username: user.username || ''
      });
      setPreferences({
        emailNotifications: user.preferences?.emailNotifications ?? true,
        securityNotifications: user.preferences?.securityNotifications ?? true,
        marketingEmails: user.preferences?.marketingEmails ?? false,
        theme: theme || 'light',
        language: user.preferences?.language || user.language || 'en'
      });
    }
  }, [user, theme]);

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  const showConfirm = (options) => {
    setConfirmModal({
      show: true,
      title: options.title,
      message: options.message,
      onConfirm: options.onConfirm,
      type: options.type || 'warning'
    });
  };

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePassword = (password) => {
    return password.length >= 8 && /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password);
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileErrors({});

    try {
      // Validation
      const errors = {};
      
      if (!profileData.email.trim()) {
        errors.email = 'Email is required';
      } else if (!validateEmail(profileData.email)) {
        errors.email = 'Please enter a valid email address';
      }

      if (!profileData.username.trim()) {
        errors.username = 'Username is required';
      } else if (profileData.username.length < 3) {
        errors.username = 'Username must be at least 3 characters';
      } else if (!/^[a-zA-Z0-9_-]+$/.test(profileData.username)) {
        errors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
      }

      if (Object.keys(errors).length > 0) {
        setProfileErrors(errors);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: profileData.email,
          username: profileData.username
        })
      });

      if (response.ok) {
        showToast('Profile updated successfully!', 'success');
        // Update user context if needed
      } else {
        const errorData = await response.json();
        if (errorData.field) {
          setProfileErrors({ [errorData.field]: errorData.error });
        } else {
          showToast(errorData.error || 'Failed to update profile', 'error');
        }
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordErrors({});

    try {
      // Validation
      const errors = {};
      
      if (!passwordData.currentPassword) {
        errors.currentPassword = 'Current password is required';
      }
      
      if (!passwordData.newPassword) {
        errors.newPassword = 'New password is required';
      } else if (!validatePassword(passwordData.newPassword)) {
        errors.newPassword = 'Password must be at least 8 characters with uppercase, lowercase, and number';
      }
      
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }

      if (Object.keys(errors).length > 0) {
        setPasswordErrors(errors);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/password/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (response.ok) {
        showToast('Password changed successfully!', 'success');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const errorData = await response.json();
        if (errorData.field) {
          setPasswordErrors({ [errorData.field]: errorData.error });
        } else {
          showToast(errorData.error || 'Failed to change password', 'error');
        }
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handlePreferencesSubmit = async (e) => {
    e.preventDefault();
    setPreferencesSaving(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/preferences/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });

      if (response.ok) {
        showToast('Preferences updated successfully!', 'success');
        
        // Apply theme change immediately
        if (preferences.theme !== theme) {
          setTheme(preferences.theme);
          showToast(`Switched to ${preferences.theme} mode!`, 'success');
        }
        
        // Apply language change immediately
        if (preferences.language !== user?.preferences?.language) {
          // Update the document language attribute
          document.documentElement.lang = preferences.language;
          showToast('Language preference saved. Some changes may require a page refresh.', 'info');
        }
      } else {
        const errorData = await response.json();
        showToast(errorData.error || 'Failed to update preferences', 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setPreferencesSaving(false);
    }
  };

  // Handle theme change immediately when user clicks theme buttons
  const handleThemeChange = (newTheme) => {
    setPreferences({ ...preferences, theme: newTheme });
    setTheme(newTheme); // Apply immediately
  };

  // Function to get language display name
  const getLanguageDisplayName = (langCode) => {
    const languages = {
      'en': 'English',
      'es': 'Español',
      'fr': 'Français', 
      'de': 'Deutsch',
      'it': 'Italiano',
      'pt': 'Português',
      'ru': 'Русский',
      'ja': '日本語',
      'ko': '한국어',
      'zh': '中文',
      'ar': 'العربية',
      'hi': 'हिंदी'
    };
    return languages[langCode] || langCode;
  };

  // Function to get current timezone dynamically
  const getCurrentTimezone = () => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  };

  // Function to format timezone display name
  const formatTimezone = (timezone) => {
    try {
      const now = new Date();
      const timeString = now.toLocaleTimeString('en-US', { 
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const offsetString = now.toLocaleString('en-US', {
        timeZone: timezone,
        timeZoneName: 'short'
      }).split(' ').pop();
      
      return `${timezone.replace('_', ' ')} (${offsetString} - ${timeString})`;
    } catch (error) {
      return timezone;
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copied to clipboard!`, 'success');
    });
  };

  const handleDeleteAccount = async () => {
    showConfirm({
      title: 'Delete Account',
      message: 'Are you sure you want to permanently delete your account? This action cannot be undone and will remove all your data.',
      type: 'danger',
      onConfirm: async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/user/account/delete', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.ok) {
            showToast('Account deleted successfully', 'success');
            setTimeout(() => logout(), 2000);
          } else {
            const errorData = await response.json();
            showToast(errorData.error || 'Failed to delete account', 'error');
          }
        } catch (error) {
          showToast('Error deleting account', 'error');
        }
      }
    });
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="h-4 w-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="h-4 w-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Settings className="h-4 w-4" /> },
    { id: 'account', label: 'Account', icon: <User className="h-4 w-4" /> }
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">Account Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">Manage your account preferences and security settings</p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors duration-200">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 transition-colors duration-200">
          <nav className="flex space-x-1 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Profile Information</h3>
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                          Username *
                        </label>
                        <input
                          type="text"
                          value={profileData.username}
                          onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
                            profileErrors.username ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="Your username"
                        />
                        {profileErrors.username && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{profileErrors.username}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
                            profileErrors.email ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="your@email.com"
                        />
                        {profileErrors.email && (
                          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{profileErrors.email}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2 transition-colors duration-200"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Change Password</h3>
                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        Current Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          className={`w-full px-3 py-2 pr-10 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
                            passwordErrors.currentPassword ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="Enter your current password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                          {showPasswords.current ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                        </button>
                      </div>
                      {passwordErrors.currentPassword && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{passwordErrors.currentPassword}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        New Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.new ? 'text' : 'password'}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          className={`w-full px-3 py-2 pr-10 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
                            passwordErrors.newPassword ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="Enter a new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                          {showPasswords.new ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                        </button>
                      </div>
                      {passwordErrors.newPassword && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{passwordErrors.newPassword}</p>
                      )}
                      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        Password must be at least 8 characters with uppercase, lowercase, and number
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200">
                        Confirm New Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          className={`w-full px-3 py-2 pr-10 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200 ${
                            passwordErrors.confirmPassword ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                          }`}
                          placeholder="Confirm your new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        >
                          {showPasswords.confirm ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                        </button>
                      </div>
                      {passwordErrors.confirmPassword && (
                        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{passwordErrors.confirmPassword}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={passwordSaving}
                      className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2 transition-colors duration-200"
                    >
                      {passwordSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Changing Password...</span>
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4" />
                          <span>Change Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security Information */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Security Information</h3>
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <Shield className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Account Security</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Your account is protected with password authentication</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Coming soon - Add an extra layer of security to your account</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Notification Preferences</h3>
                <form onSubmit={handlePreferencesSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">Email Notifications</label>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Receive important updates and alerts via email</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.emailNotifications}
                          onChange={(e) => setPreferences({ ...preferences, emailNotifications: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">Security Notifications</label>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Get notified about login attempts and security changes</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.securityNotifications}
                          onChange={(e) => setPreferences({ ...preferences, securityNotifications: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">Marketing Emails</label>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Receive product updates and promotional content</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences.marketingEmails}
                          onChange={(e) => setPreferences({ ...preferences, marketingEmails: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Appearance & Language</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Theme Preference
                        </label>
                        <div className="flex space-x-3">
                          <button
                            type="button"
                            onClick={() => handleThemeChange('light')}
                            className={`flex items-center space-x-2 px-4 py-2 border rounded-md transition-colors duration-200 ${
                              preferences.theme === 'light' 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Sun className="h-4 w-4" />
                            <span>Light</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleThemeChange('dark')}
                            className={`flex items-center space-x-2 px-4 py-2 border rounded-md transition-colors duration-200 ${
                              preferences.theme === 'dark' 
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            <Moon className="h-4 w-4" />
                            <span>Dark</span>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Interface Language
                        </label>
                        <select
                          value={preferences.language}
                          onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-200"
                        >
                          <option value="en">🇺🇸 English</option>
                          <option value="es">🇪🇸 Español</option>
                          <option value="fr">🇫🇷 Français</option>
                          <option value="de">🇩🇪 Deutsch</option>
                          <option value="it">🇮🇹 Italiano</option>
                          <option value="pt">🇵🇹 Português</option>
                          <option value="ru">🇷🇺 Русский</option>
                          <option value="ja">🇯🇵 日本語</option>
                          <option value="ko">🇰🇷 한국어</option>
                          <option value="zh">🇨🇳 中文</option>
                          <option value="ar">🇸🇦 العربية</option>
                          <option value="hi">🇮🇳 हिंदी</option>
                        </select>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-200">
                          Changes will take effect after saving preferences
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={preferencesSaving}
                      className="bg-blue-600 dark:bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2 transition-colors duration-200"
                    >
                      {preferencesSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          <span>Save Preferences</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              {/* Account Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 transition-colors duration-200">Account Information</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Account ID</label>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1 rounded transition-colors duration-200">{user?.uuid}</span>
                        <button
                          onClick={() => copyToClipboard(user?.uuid, 'Account ID')}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 transition-colors duration-200"
                          title="Copy Account ID"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Account Type</label>
                      <div className="flex items-center space-x-2">
                        {user?.role === 'admin' ? <Crown className="h-4 w-4 text-yellow-500" /> : <User className="h-4 w-4 text-blue-500" />}
                        <span className="capitalize font-medium text-gray-900 dark:text-white transition-colors duration-200">{user?.role}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Member Since</label>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white transition-colors duration-200">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : 'Unknown'}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Last Login</label>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white transition-colors duration-200">{user?.lastLogin ? new Date(user.lastLogin).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Never'}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Current Timezone</label>
                      <div className="flex items-center space-x-2">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white transition-colors duration-200">{formatTimezone(getCurrentTimezone())}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Language Preference</label>
                      <div className="flex items-center space-x-2">
                        <Globe className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-900 dark:text-white transition-colors duration-200">{getLanguageDisplayName(preferences.language)}</span>
                      </div>
                    </div>
                  </div>

                  {user?.subscription && user.subscription.plan !== 'none' && (
                    <div className="border-t border-gray-200 pt-4">
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Subscription</label>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium">{user.subscription.plan}</span>
                          {user.subscription.expiresAt && (
                            <span className="text-sm text-gray-500">
                              • Expires {new Date(user.subscription.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.subscription.expiresAt && new Date(user.subscription.expiresAt) > new Date()
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.subscription.expiresAt && new Date(user.subscription.expiresAt) > new Date() ? 'Active' : 'Expired'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-red-900 dark:text-red-400 mb-4">Danger Zone</h3>
                <div className="border border-red-200 rounded-lg p-6 bg-red-50 dark:bg-red-800">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-red-900 dark:text-red-400">Delete Account</h4>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </p>
                      <button
                        onClick={handleDeleteAccount}
                        className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center space-x-2 text-sm"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete Account</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
          onClose={() => setConfirmModal({ show: false, title: '', message: '', onConfirm: () => {} })}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText="Confirm"
          cancelText="Cancel"
        />
      )}
    </div>
  );
};

export default AccountSettings; 