import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Monitor, LogOut, User, Copy, Settings, ChevronDown, Home } from 'lucide-react';
import Toast from './Toast';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const { } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = async () => {
    await logout();
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const navigation = [
    { name: 'Dashboard', path: '/dashboard', icon: Home },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and navigation */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-primary-600 dark:bg-primary-500 rounded-lg flex items-center justify-center transition-colors duration-200">
                  <Monitor className="h-5 w-5 text-white" />
                </div>
                <h1 className="ml-3 text-xl font-semibold text-gray-900 dark:text-white transition-colors duration-200">
                  VM Dashboard
                </h1>
              </div>

              {/* Navigation */}
              <nav className="hidden md:flex space-x-4">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.name}
                      onClick={() => navigate(item.path)}
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {item.name}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-4">
              {/* Mobile Account ID - visible on small screens */}
              {user?.uuid && (
                <div className="flex md:hidden items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-mono">{user.uuid}</span>
                  <div
                    onClick={() => copyToClipboard(user.uuid, 'Account ID')}
                    className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors duration-200 cursor-pointer"
                    title="Copy Account ID"
                  >
                    <Copy className="h-3 w-3" />
                  </div>
                </div>
              )}
              
              {/* User dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-3 text-sm rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                >
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center transition-colors duration-200">
                    <User className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{user?.username}</p>
                    <div className="flex items-center space-x-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 capitalize transition-colors duration-200">{user?.role || 'Customer'}</p>
                      {user?.uuid && (
                        <>
                          <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
                          <div className="flex items-center space-x-1">
                            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 transition-colors duration-200">
                              {user.uuid}
                            </span>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(user.uuid, 'Account ID');
                              }}
                              className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors duration-200 cursor-pointer"
                              title="Copy Account ID"
                            >
                              <Copy className="h-3 w-3" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-all duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
                    <button
                      onClick={() => {
                        navigate('/settings');
                        setDropdownOpen(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      <Settings className="h-4 w-4 mr-3" />
                      Account Settings
                    </button>
                    
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    
                    <button
                      onClick={() => {
                        handleLogout();
                        setDropdownOpen(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      <LogOut className="h-4 w-4 mr-3" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content - flex-grow pushes footer to bottom */}
      <main className="flex-grow max-w-7xl w-full mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {children}
        </div>
      </main>

      {/* Footer - will stick to bottom */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
            <p>&copy; 2024 VM Service. All rights reserved.</p>
            <div className="flex items-center space-x-2">
              <p>Powered by Proxmox</p>
              <img 
                src="/proxmox.png" 
                alt="Proxmox" 
                className="h-4 w-auto opacity-70 dark:opacity-60 transition-opacity duration-200"
              />
            </div>
          </div>
        </div>
      </footer>

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        show={toast.show}
        onClose={() => setToast({ ...toast, show: false })}
        type={toast.type}
      />
    </div>
  );
};

export default Layout; 