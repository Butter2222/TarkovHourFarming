import React from 'react';
import { AlertTriangle, CheckCircle, X, Gift, CreditCard, Clock } from 'lucide-react';

const ConfirmModal = ({ 
  show, 
  onClose, 
  onConfirm, 
  title = 'Confirm Action', 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel',
  type = 'warning' // 'warning', 'danger', 'info', 'subscription'
}) => {
  if (!show) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: AlertTriangle,
          iconColor: 'text-red-600 dark:text-red-400',
          iconBg: 'bg-red-100 dark:bg-red-900',
          confirmBtn: 'bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 text-white',
          headerBg: 'bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900 dark:to-red-800',
          borderColor: 'border-red-200 dark:border-red-600'
        };
      case 'info':
      case 'subscription':
        return {
          icon: type === 'subscription' ? Gift : CheckCircle,
          iconColor: 'text-blue-600 dark:text-blue-400',
          iconBg: 'bg-blue-100 dark:bg-blue-900',
          confirmBtn: 'bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-600 dark:hover:to-indigo-600 text-white',
          headerBg: 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900 dark:to-indigo-900',
          borderColor: 'border-blue-200 dark:border-blue-600'
        };
      default: // warning
        return {
          icon: AlertTriangle,
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          iconBg: 'bg-yellow-100 dark:bg-yellow-900',
          confirmBtn: 'bg-yellow-600 dark:bg-yellow-500 hover:bg-yellow-700 dark:hover:bg-yellow-600 text-white',
          headerBg: 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900 dark:to-orange-900',
          borderColor: 'border-yellow-200 dark:border-yellow-600'
        };
    }
  };

  const typeStyles = getTypeStyles();
  const IconComponent = typeStyles.icon;

  // Check if this is a subscription-related confirmation
  const isSubscriptionModal = title.toLowerCase().includes('subscription') || title.toLowerCase().includes('grant');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl border-2 ${typeStyles.borderColor} transform transition-all duration-200`}>
        {/* Header */}
        <div className={`${typeStyles.headerBg} px-6 py-4 rounded-t-xl border-b ${typeStyles.borderColor} transition-colors duration-200`}>
          <div className="flex items-center">
            <div className={`rounded-full p-3 ${typeStyles.iconBg} mr-4 transition-colors duration-200`}>
              <IconComponent className={`h-6 w-6 ${typeStyles.iconColor} transition-colors duration-200`} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white transition-colors duration-200">{title}</h3>
              {isSubscriptionModal && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">Administrative Action Required</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-4 transition-colors duration-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            {isSubscriptionModal ? (
              <div className="space-y-4">
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line transition-colors duration-200">{message}</p>
                <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4 transition-colors duration-200">
                  <div className="flex items-center mb-2">
                    <Gift className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                    <span className="font-medium text-green-900 dark:text-green-100 transition-colors duration-200">Free Grant</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 transition-colors duration-200">
                    This subscription will be provided at no cost to the user as an administrative grant.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line transition-colors duration-200">{message}</p>
            )}
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors duration-200 font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-6 py-2.5 rounded-lg transition-all duration-200 font-medium flex items-center ${typeStyles.confirmBtn}`}
            >
              {isSubscriptionModal && <Gift className="h-4 w-4 mr-2" />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal; 