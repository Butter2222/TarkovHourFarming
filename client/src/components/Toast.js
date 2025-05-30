import React, { useEffect } from 'react';
import { CheckCircle, X, AlertCircle, Gift } from 'lucide-react';

const Toast = ({ message, show, onClose, type = 'success' }) => {
  useEffect(() => {
    if (show) {
      // Auto close after 5 seconds for longer messages, 3 seconds for short ones
      const autoCloseTime = message && message.length > 100 ? 5000 : 3000;
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseTime);

      return () => clearTimeout(timer);
    }
  }, [show, onClose, message]);

  if (!show) return null;

  // Check if this is a subscription success message
  const isSubscriptionSuccess = message && message.includes('Subscription Granted Successfully');

  const getTypeStyles = () => {
    switch (type) {
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: 'text-red-600',
          text: 'text-red-800',
          button: 'text-red-600 hover:text-red-800',
          IconComponent: AlertCircle
        };
      case 'success':
      default:
        return {
          container: isSubscriptionSuccess 
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
            : 'bg-green-50 border-green-200',
          icon: 'text-green-600',
          text: 'text-green-800',
          button: 'text-green-600 hover:text-green-800',
          IconComponent: isSubscriptionSuccess ? Gift : CheckCircle
        };
    }
  };

  const styles = getTypeStyles();
  const { IconComponent } = styles;

  // Split message by lines for better formatting
  const messageLines = message ? message.split('\n') : [];
  const hasMultipleLines = messageLines.length > 1;

  return (
    <div className="fixed top-4 right-4 z-50 transition-all duration-300 ease-in-out">
      <div className={`rounded-lg shadow-xl border ${hasMultipleLines ? 'max-w-md' : 'max-w-sm'} p-4 ${styles.container}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start min-w-0 flex-1">
            <IconComponent className={`h-5 w-5 mr-3 mt-0.5 flex-shrink-0 ${styles.icon}`} />
            <div className="min-w-0 flex-1">
              {hasMultipleLines ? (
                <div className="space-y-1">
                  {messageLines.map((line, index) => {
                    if (!line.trim()) return <div key={index} className="h-2" />; // Empty line spacing
                    
                    // Style the first line (title) differently if it contains emoji or "Successfully"
                    const isTitle = index === 0 && (line.includes('🎉') || line.includes('Successfully'));
                    
                    return (
                      <p
                        key={index}
                        className={`text-sm ${styles.text} ${
                          isTitle 
                            ? 'font-bold text-base' 
                            : line.includes(':') 
                            ? 'font-medium' 
                            : 'font-normal'
                        }`}
                      >
                        {line}
                      </p>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-sm font-medium ${styles.text}`}>
                  {message}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`ml-3 flex-shrink-0 ${styles.button} transition-colors`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        {isSubscriptionSuccess && (
          <div className="mt-3 pt-2 border-t border-green-200">
            <p className="text-xs text-green-600 font-medium">
              Admin Grant • Free Subscription
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Toast; 