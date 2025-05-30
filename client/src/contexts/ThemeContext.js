import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);

  // Initialize theme from localStorage or user preferences
  useEffect(() => {
    const initializeTheme = () => {
      // First check localStorage for saved theme
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
        setTheme(savedTheme);
        applyTheme(savedTheme);
        setLoading(false);
        return;
      }

      // If no saved theme, check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemTheme = prefersDark ? 'dark' : 'light';
      setTheme(systemTheme);
      applyTheme(systemTheme);
      setLoading(false);
    };

    initializeTheme();
  }, []);

  // Apply theme to document
  const applyTheme = (newTheme) => {
    const root = document.documentElement;
    
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Also set a data attribute for additional CSS targeting
    root.setAttribute('data-theme', newTheme);
  };

  // Update theme and save to localStorage
  const updateTheme = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  // Toggle between light and dark
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    updateTheme(newTheme);
  };

  // Update theme from user preferences (for account settings)
  const setThemeFromPreferences = (userTheme) => {
    if (userTheme && (userTheme === 'light' || userTheme === 'dark')) {
      updateTheme(userTheme);
    }
  };

  const value = {
    theme,
    setTheme: updateTheme,
    toggleTheme,
    setThemeFromPreferences,
    isDark: theme === 'dark',
    isLight: theme === 'light',
    loading
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}; 