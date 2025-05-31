import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle session security violations immediately
    if (error.response?.data?.code === 'SESSION_MISMATCH') {
      console.error('CRITICAL SECURITY ALERT: Session mismatch detected');
      localStorage.removeItem('token');
      // Force immediate redirect to login with security message
      window.location.href = '/login?security=session_mismatch';
      return Promise.reject(error);
    }

    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      
      // Only redirect if it's not a login attempt (to preserve error messages)
      if (!error.config?.url?.includes('/auth/login')) {
        window.location.href = '/login';
      }
    }
    
    // Handle suspended accounts (423 - Locked)
    if (error.response?.status === 423) {
      localStorage.removeItem('token');
      
      // Only redirect if it's not a login attempt (to preserve error messages)
      if (!error.config?.url?.includes('/auth/login')) {
        window.location.href = '/login';
      }
    }
    
    // Handle banned accounts (403 - Forbidden)
    if (error.response?.status === 403 && error.response?.data?.accountStatus === 'banned') {
      localStorage.removeItem('token');
      
      // Only redirect if it's not a login attempt (to preserve error messages)
      if (!error.config?.url?.includes('/auth/login')) {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api; 