import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

const Toast = ({ message, show, onClose, type = 'success' }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  const getStyles = () => {
    switch (type) {
      case 'error':
        return {
          bg: 'bg-white dark:bg-gray-800 border-l-red-500',
          icon: 'text-red-500',
          text: 'text-gray-900 dark:text-gray-100',
          IconComponent: AlertCircle
        };
      case 'success':
      default:
        return {
          bg: 'bg-white dark:bg-gray-800 border-l-green-500',
          icon: 'text-green-500',
          text: 'text-gray-900 dark:text-gray-100',
          IconComponent: CheckCircle
        };
    }
  };

  const styles = getStyles();
  const { IconComponent } = styles;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
      <div className={`
        ${styles.bg} border-l-4 shadow-lg rounded-r-lg border border-gray-200 dark:border-gray-700
        p-4 max-w-sm min-w-[300px] transition-all duration-200
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <IconComponent className={`h-5 w-5 ${styles.icon} flex-shrink-0`} />
            <p className={`text-sm font-medium ${styles.text}`}>
              {message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-4"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toast; 