import React, { useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Monitor, Lock, User, Mail, UserPlus } from 'lucide-react';

const Login = () => {
  const { login, user } = useAuth();
  const { } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(formData.username, formData.password);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Basic validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    // Email validation - check for real email format and domain
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }

    // Check for common disposable email domains
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com', 'mailinator.com',
      'yopmail.com', 'throwaway.email', 'temp-mail.org', 'getnada.com',
      'maildrop.cc', 'sharklasers.com', 'guerrillamailblock.com', 'pokemail.net',
      'spam4.me', 'bccto.me', 'chacuo.net', 'dispostable.com', 'spambox.us',
      'tempail.com', 'tempmailaddress.com', '20minutemail.it', 'emailondeck.com',
      'temp.com', 'test.com', 'example.com', 'fake.com', 'dummy.com',
      'sample.com', 'testing.com', 'demo.com', 'localhost.com', 'invalid.com',
      'notreal.com', 'fakemail.com', 'testmail.com', 'tempuser.com', 'nomail.com',
      'temporary.com', 'disposable.com', 'throwaway.com', 'junk.com', 'trash.com'
    ];
    
    const emailDomain = formData.email.split('@')[1]?.toLowerCase();
    if (disposableDomains.includes(emailDomain)) {
      setError('Please use a real email address, not a temporary or disposable email');
      setLoading(false);
      return;
    }

    // Additional check for common real email domains (whitelist approach)
    const commonRealDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
      'icloud.com', 'protonmail.com', 'live.com', 'msn.com', 'yandex.com',
      'mail.com', 'zoho.com', 'fastmail.com', 'tutanota.com', 'inbox.com',
      'yahoo.co.uk', 'yahoo.ca', 'yahoo.com.au', 'gmail.co.uk', 'hotmail.co.uk',
      'outlook.co.uk', 'live.co.uk', 'btinternet.com', 'virginmedia.com',
      'sky.com', 'talktalk.net', 'tiscali.co.uk', 'ntlworld.com'
    ];
    
    // If it's not a common real domain, reject it for security
    if (!commonRealDomains.includes(emailDomain)) {
      setError('Please use a real email address from a recognized email provider (Gmail, Yahoo, Outlook, etc.)');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          email: formData.email,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Registration successful, now log them in
        const loginResult = await login(formData.username, formData.password);
        if (!loginResult.success) {
          setError('Registration successful, but login failed. Please try logging in manually.');
        }
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    }
    
    setLoading(false);
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setFormData({
      username: '',
      password: '',
      email: '',
      confirmPassword: ''
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-primary-600 dark:bg-primary-500 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Monitor className="h-8 w-8 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
            {isRegistering ? 'Create Account' : 'VM Dashboard'}
          </h2>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 transition-colors duration-200 border dark:border-gray-700">
          <form className="space-y-6" onSubmit={isRegistering ? handleRegister : handleLogin}>
            {error && (
              <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md transition-colors duration-200">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-200">
                Username
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            {isRegistering && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-200">
                  Email Address
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                    placeholder="Enter your email"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-200">
                Password
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            {isRegistering && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-200">
                  Confirm Password
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 transition-colors duration-200"
                    placeholder="Confirm your password"
                  />
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  {isRegistering ? <UserPlus className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </span>
                {loading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In')}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600 transition-colors duration-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors duration-200">
                  {isRegistering ? 'Already have an account?' : "Don't have an account?"}
                </span>
              </div>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                  setFormData({
                    username: '',
                    password: '',
                    email: '',
                    confirmPassword: ''
                  });
                }}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
              >
                {isRegistering ? 'Sign In Instead' : 'Create New Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
          &copy; 2024 VM Service. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login; 