import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  CreditCard, 
  Crown, 
  Check, 
  Loader2, 
  AlertCircle,
  Calendar,
  DollarSign,
  Trash2,
  User,
  Shield,
  Clock
} from 'lucide-react';
import Toast from './Toast';
import ConfirmModal from './ConfirmModal';

const SubscriptionManager = () => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

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

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: 12,
      period: 'month',
      description: 'Perfect for casual players',
      features: [
        '1 Dedicated Virtual Machine',
        '24/7 Hour Farming',
        'Basic Support',
        'Secure Account Handling',
        'Monthly Billing'
      ],
      stripeId: 'price_basic_monthly'
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 20,
      period: 'month',
      description: 'Advanced features for serious players',
      features: [
        '2 Dedicated Virtual Machines',
        '24/7 Hour Farming',
        'Priority Support',
        'Secure Account Handling',
        'Advanced Monitoring',
        'Custom Schedules',
        'Monthly Billing'
      ],
      stripeId: 'price_premium_monthly',
      popular: true
    }
  ];

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/payment/subscription-status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId) => {
    setProcessing(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          planId,
          planName: plans.find(p => p.id === planId)?.name
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect to Stripe Checkout
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
        } else {
          setError('Payment processing is currently under maintenance. Please try again later.');
        }
      } else {
        setError(data.error || 'Failed to initiate payment');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    showConfirm({
      title: 'Cancel Subscription',
      message: 'Are you sure you want to cancel your subscription? Your VMs will stop running at the end of the billing period.',
      type: 'warning',
      confirmText: 'Cancel Subscription',
      onConfirm: async () => {
        setProcessing(true);
        try {
          const token = localStorage.getItem('token');
          const response = await fetch('/api/payment/cancel-subscription', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (response.ok) {
            await fetchSubscriptionStatus();
            showToast('Subscription cancelled successfully. Your service will continue until the end of the billing period.', 'success');
          } else {
            const data = await response.json();
            setError(data.error || 'Failed to cancel subscription');
          }
        } catch (error) {
          setError('Network error. Please try again.');
        } finally {
          setProcessing(false);
        }
      }
    });
  };

  const handleReactivateSubscription = async () => {
    setProcessing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/payment/reactivate-subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await fetchSubscriptionStatus();
        showToast('Subscription reactivated successfully! Your service will continue to renew.', 'success');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to reactivate subscription');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  const showConfirm = (options) => {
    setConfirmModal({
      show: true,
      title: options.title || 'Confirm Action',
      message: options.message,
      onConfirm: options.onConfirm,
      type: options.type || 'warning',
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel'
    });
  };

  const hideConfirm = () => {
    setConfirmModal(prev => ({ ...prev, show: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'none';
  const isActive = subscription && subscription.expiresAt && new Date(subscription.expiresAt) > new Date();
  const isCancelled = subscription?.status === 'cancel_at_period_end';
  const isExpired = subscription && subscription.expiresAt && new Date(subscription.expiresAt) <= new Date();

  const getSubscriptionStatusDisplay = () => {
    if (!subscription || subscription.plan === 'none') {
      return { text: 'No Subscription', color: 'bg-gray-100 text-gray-800' };
    }
    
    if (isExpired) {
      return { text: 'Expired', color: 'bg-red-100 text-red-800' };
    }
    
    if (isCancelled) {
      return { text: 'Cancelling', color: 'bg-yellow-100 text-yellow-800' };
    }
    
    if (isActive) {
      return { text: 'Active', color: 'bg-green-100 text-green-800' };
    }
    
    return { text: 'Inactive', color: 'bg-gray-100 text-gray-800' };
  };

  const statusDisplay = getSubscriptionStatusDisplay();

  return (
    <div className="space-y-6">
      {/* Current Subscription Status */}
      {subscription && subscription.plan !== 'none' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center transition-colors duration-200">
                <Crown className="h-5 w-5 text-yellow-500 mr-2" />
                Current Subscription
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
                Plan: <span className="font-medium">{subscription.plan}</span>
              </p>
              {subscription.expiresAt && (
                <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center mt-1 transition-colors duration-200">
                  <Calendar className="h-4 w-4 mr-1" />
                  {isCancelled 
                    ? `Ends on: ${new Date(subscription.expiresAt).toLocaleDateString()}`
                    : isExpired
                    ? `Expired on: ${new Date(subscription.expiresAt).toLocaleDateString()}`
                    : `Renews on: ${new Date(subscription.expiresAt).toLocaleDateString()}`
                  }
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusDisplay.color}`}>
                {statusDisplay.text}
              </span>
              {isActive && !isCancelled && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={processing}
                  className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900 rounded-md transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              {isCancelled && (
                <button
                  onClick={handleReactivateSubscription}
                  disabled={processing}
                  className="px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900 rounded-md transition-colors disabled:opacity-50"
                >
                  Reactivate
                </button>
              )}
            </div>
          </div>
          {isCancelled && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-md transition-colors duration-200">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                <strong>Cancellation Notice:</strong> Your subscription will end on {new Date(subscription.expiresAt).toLocaleDateString()}. 
                Your VMs will stop running after this date. You can reactivate your subscription at any time before it expires.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md flex items-center transition-colors duration-200">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {/* Plan Selection */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 transition-colors duration-200">
          {currentPlan === 'none' ? 'Choose Your Plan' : 'Upgrade or Change Plan'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan.toLowerCase() === plan.id;
            
            return (
              <div
                key={plan.id}
                className={`rounded-lg p-6 border-2 transition-all flex flex-col h-full ${
                  plan.popular
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400 relative'
                    : isCurrentPlan
                    ? 'border-green-500 bg-green-50 dark:bg-green-900 dark:border-green-400'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                } transition-colors duration-200`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-600 dark:bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <span className="bg-green-600 dark:bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <Check className="h-4 w-4 mr-1" />
                      Current
                    </span>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors duration-200">{plan.name}</h3>
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center transition-colors duration-200">
                      <DollarSign className="h-6 w-6" />
                      {plan.price}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">/{plan.period}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 transition-colors duration-200">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-6 flex-grow">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-sm">
                      <Check className="h-4 w-4 text-green-500 dark:text-green-400 mr-3 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 transition-colors duration-200">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={processing || isCurrentPlan}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center mt-auto ${
                    isCurrentPlan
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : plan.popular
                      ? 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600'
                      : 'bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed duration-200`}
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isCurrentPlan ? (
                    'Current Plan'
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5 mr-2" />
                      {currentPlan === 'none' ? 'Subscribe' : 'Switch Plan'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Info */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 transition-colors duration-200">Payment Information</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 transition-colors duration-200">
          <p>• Payments are processed securely through Stripe</p>
          <p>• Your VMs will be activated immediately after successful payment</p>
          <p>• You can cancel or change your subscription at any time</p>
          <p>• All payments are automatically recurring unless cancelled</p>
        </div>
      </div>

      {/* Toast Notification */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ show: false, message: '', type: 'success' })}
        />
      )}

      {/* Confirmation Modal */}
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

export default SubscriptionManager; 