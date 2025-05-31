import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  CheckCircle,
  Calendar,
  AlertTriangle,
  CreditCard,
  Crown,
  Loader2,
  RefreshCw,
  DollarSign,
  Cpu,
  HardDrive,
  Zap,
  ArrowRight,
  ArrowLeft,
  Users,
  Mail
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

  // Multi-step configurator state
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPlanType, setSelectedPlanType] = useState('');
  const [selectedVMCount, setSelectedVMCount] = useState(1);
  const [customVMCount, setCustomVMCount] = useState(1);

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

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Plan types configuration
  const planTypes = [
    {
      id: 'kd_drop',
      name: 'KD Drop',
      specs: '4vCPU / 4GB', 
      description: 'High-resource use',
      color: 'red',
      icon: <Zap className="h-8 w-8" />,
      features: [
        'High-performance computing',
        'Advanced processing power',
        'Enhanced resource allocation',
        'Priority queue processing'
      ]
    },
    {
      id: 'hour_booster',
      name: 'Hour Booster',
      specs: '2vCPU / 4GB',
      description: 'Idle hours only',
      color: 'blue',
      icon: <Cpu className="h-8 w-8" />,
      features: [
        'Optimized for idle hour farming',
        'Energy efficient processing',
        'Basic resource allocation',
        '24/7 uptime guarantee'
      ],
      popular: true
    },
    {
      id: 'dual_mode',
      name: 'Dual Mode',
      specs: '4vCPU / 4GB',
      description: 'Switchable mode, only one active',
      color: 'purple',
      icon: <HardDrive className="h-8 w-8" />,
      features: [
        'Flexible switching between modes',
        'One active instance at a time',
        'Best of both worlds',
        'Mode switching on demand'
      ]
    }
  ];

  // VM quantity options with pricing
  const vmQuantities = [
    { count: 1, label: '1 VM' },
    { count: 2, label: '2 VMs' },
    { count: 5, label: '5 VMs' },
    { count: 'custom', label: 'Custom', isCustom: true, customRange: { min: 1, max: 10 } },
    { count: '20+', label: '20+ VMs', isCustom: true }
  ];

  // Pricing matrix
  const pricingMatrix = {
    hour_booster: {
      1: { price: 12, perVM: 12 },
      2: { price: 20, perVM: 10 },
      5: { price: 45, perVM: 9 },
      10: { price: 80, perVM: 8 },
      20: { price: 140, perVM: 7 }
    },
    kd_drop: {
      1: { price: 16, perVM: 16 },
      2: { price: 28, perVM: 14 },
      5: { price: 65, perVM: 13 },
      10: { price: 120, perVM: 12 },
      20: { price: 220, perVM: 11 }
    },
    dual_mode: {
      1: { price: 18, perVM: 18 },
      2: { price: 32, perVM: 16 },
      5: { price: 70, perVM: 14 },
      10: { price: 130, perVM: 13 },
      20: { price: 240, perVM: 12 }
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
    
    // Check for successful checkout in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const canceled = urlParams.get('canceled');
    const sessionId = urlParams.get('session_id');
    
    if (success === 'true' && sessionId) {
      verifyCheckoutSession(sessionId);
    } else if (canceled === 'true') {
      showToast('Checkout was canceled. No charges were made.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const verifyCheckoutSession = async (sessionId) => {
    try {
      console.log('🔍 Verifying checkout session:', sessionId);
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/payment/verify-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId })
      });

      const data = await response.json();
      console.log('📋 Verification response:', data);

      if (response.ok) {
        console.log('✅ Payment verified:', data);
        await fetchSubscriptionStatus();
        showToast('🎉 Payment successful! Your subscription is now active!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        console.error('❌ Payment verification failed:', data);
        showToast(`Payment verification failed: ${data.error}. Please contact support if you were charged.`, 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      showToast('Error verifying payment. Please refresh the page or contact support.', 'error');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

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

  const handleSubscribe = async () => {
    if (selectedVMCount === '20+') {
      // Show contact form for custom pricing
      showToast('Please contact our sales team for custom pricing on 20+ VMs', 'info');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const actualVMCount = selectedVMCount === 'custom' ? customVMCount : selectedVMCount;
      
      // Check if this is an upgrade or new subscription
      const isUpgrade = subscription && subscription.plan !== 'none' && 
                       subscription.stripeSubscriptionId && 
                       (subscription.status === 'active' || subscription.status === 'trialing');
      
      const endpoint = isUpgrade ? '/api/payment/upgrade-subscription' : '/api/payment/create-checkout-session';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          planType: selectedPlanType,
          vmCount: actualVMCount,
          planName: planTypes.find(p => p.id === selectedPlanType)?.name
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (isUpgrade) {
          // Handle successful upgrade
          await fetchSubscriptionStatus();
          
          // Show detailed upgrade success message
          const billingMessage = data.billing?.chargedNow 
            ? `Upgrade complete! ${data.billing.message}`
            : `Upgrade activated! ${data.billing?.message || 'Changes are effective immediately.'}`;
          
          showToast(billingMessage, 'success');
          
          // Reset the configurator
          setCurrentStep(1);
          setSelectedPlanType('');
          setSelectedVMCount(1);
          setCustomVMCount(1);
        } else if (data.checkoutUrl) {
          showToast('Redirecting to secure checkout...', 'success');
          setTimeout(() => {
            window.location.href = data.checkoutUrl;
          }, 800);
        } else {
          setError('Payment processing is currently under maintenance. Please try again later.');
          setProcessing(false);
        }
      } else {
        if (response.status === 409 && data.hasActiveSubscription) {
          // Handle case where backend detected active subscription
          setError('You already have an active subscription. The interface will update to show upgrade options.');
          await fetchSubscriptionStatus(); // Refresh subscription data
          setProcessing(false);
        } else {
          setError(data.error || 'Failed to process request');
          setProcessing(false);
        }
      }
    } catch (error) {
      setError('Network error. Please try again.');
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

  const refreshSubscriptionStatus = async () => {
    setLoading(true);
    try {
      await fetchSubscriptionStatus();
      showToast('Subscription status refreshed', 'success');
    } catch (error) {
      showToast('Failed to refresh subscription status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentPricing = () => {
    if (!selectedPlanType) return null;
    if (selectedVMCount === '20+') return null;
    if (selectedVMCount === 'custom') {
      // Calculate pricing for custom VM count with proper tier pricing
      const count = customVMCount;
      const planPricing = pricingMatrix[selectedPlanType];
      
      let perVMPrice;
      if (count === 1) {
        perVMPrice = planPricing[1].perVM;
      } else if (count === 2) {
        perVMPrice = planPricing[2].perVM;
      } else if (count >= 3 && count <= 4) {
        // Interpolate between 2 and 5 VM pricing
        const price2 = planPricing[2].perVM;
        const price5 = planPricing[5].perVM;
        perVMPrice = price2 - ((price2 - price5) * (count - 2) / 3);
      } else if (count === 5) {
        perVMPrice = planPricing[5].perVM;
      } else if (count >= 6 && count <= 9) {
        // Interpolate between 5 and 10 VM pricing (using 20 VM pricing as 10+ reference)
        const price5 = planPricing[5].perVM;
        const price20 = planPricing[20].perVM;
        // Estimate 10 VM pricing between 5 and 20
        const estimated10Price = price5 - ((price5 - price20) * 0.6);
        perVMPrice = price5 - ((price5 - estimated10Price) * (count - 5) / 5);
      } else { // count >= 10
        // Use estimated 10+ pricing
        const price5 = planPricing[5].perVM;
        const price20 = planPricing[20].perVM;
        perVMPrice = price5 - ((price5 - price20) * 0.6);
      }
      
      return {
        price: Math.round(perVMPrice * count),
        perVM: Math.round(perVMPrice)
      };
    }
    return pricingMatrix[selectedPlanType]?.[selectedVMCount];
  };

  const getColorClasses = (color, variant = 'primary') => {
    const colors = {
      blue: {
        primary: 'border-blue-300 bg-blue-50/60 dark:bg-blue-900/30 dark:border-blue-500',
        text: 'text-blue-600 dark:text-blue-400',
        button: 'bg-blue-600 hover:bg-blue-700 text-white'
      },
      red: {
        primary: 'border-red-300 bg-red-50/60 dark:bg-red-900/30 dark:border-red-500', 
        text: 'text-red-600 dark:text-red-400',
        button: 'bg-red-600 hover:bg-red-700 text-white'
      },
      purple: {
        primary: 'border-purple-300 bg-purple-50/60 dark:bg-purple-900/30 dark:border-purple-500',
        text: 'text-purple-600 dark:text-purple-400', 
        button: 'bg-purple-600 hover:bg-purple-700 text-white'
      }
    };
    return colors[color]?.[variant] || '';
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
      {/* Admin Access Notice */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg shadow-sm border border-purple-200 dark:border-purple-700 p-6 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 flex items-center transition-colors duration-200">
                <Crown className="h-5 w-5 text-purple-500 mr-2" />
                Administrator Access
              </h3>
              <p className="text-sm text-purple-700 dark:text-purple-300 mt-1 transition-colors duration-200">
                You have full access to all features without subscription requirements.
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2 transition-colors duration-200">
                Admin accounts bypass all subscription checks and have unlimited VM access.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200">
                Admin Access
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Current Subscription Status - Only show for non-admin users */}
      {!isAdmin && subscription && subscription.plan !== 'none' && (
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
              <button
                onClick={refreshSubscriptionStatus}
                disabled={loading}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                title="Refresh subscription status"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {isActive && !isCancelled && (
                <button
                  onClick={handleCancelSubscription}
                  disabled={processing}
                  className="px-4 py-2 text-sm text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-50/50 dark:hover:bg-red-950/30 rounded-md transition-colors disabled:opacity-50"
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
          {isActive && !isCancelled && (
            <div className="mt-4 p-3 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-md transition-colors duration-200">
              <p className="text-sm text-green-800 dark:text-green-300">
                <strong>Want to upgrade?</strong> Use the plan configurator below to change your plan type or add more VMs. 
                The price difference will be prorated automatically.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md flex items-center transition-colors duration-200">
          <AlertTriangle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {/* Multi-Step Plan Configurator */}
      {!isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 transition-colors duration-200">
            {currentPlan === 'none' ? 'Choose Your Plan' : 'Upgrade or Change Plan'}
          </h2>
          
            {/* Step Indicator */}
            <div className="flex items-center space-x-4 mb-6">
              <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  1
                </div>
                <span className="ml-2 text-sm font-medium">Plan Type</span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  2
                </div>
                <span className="ml-2 text-sm font-medium">VM Quantity</span>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <div className={`flex items-center ${currentStep >= 3 ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                  3
                </div>
                <span className="ml-2 text-sm font-medium">Review & Subscribe</span>
              </div>
            </div>
          </div>

          {/* Step 1: Plan Type Selection */}
          {currentStep === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Choose Your Plan Type</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {planTypes.map((planType) => (
                  <div
                    key={planType.id}
                    onClick={() => setSelectedPlanType(planType.id)}
                    className={`relative p-6 rounded-lg border-2 cursor-pointer transition-all hover:shadow-lg ${
                      selectedPlanType === planType.id
                        ? getColorClasses(planType.color, 'primary')
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {planType.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                    <div className="text-center">
                      <div className={`mx-auto mb-3 ${getColorClasses(planType.color, 'text')}`}>
                        {planType.icon}
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{planType.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{planType.specs}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">{planType.description}</p>
                      
                      <ul className="text-left space-y-1">
                        {planType.features.map((feature, index) => (
                          <li key={index} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                            <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={!selectedPlanType}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Next: Choose VM Quantity
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: VM Quantity Selection */}
          {currentStep === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Choose VM Quantity</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {vmQuantities.map((option) => (
                  <div
                    key={option.count}
                    onClick={() => setSelectedVMCount(option.count)}
                    className={`p-4 rounded-lg border-2 cursor-pointer text-center transition-all hover:shadow-lg ${
                      selectedVMCount === option.count
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:border-blue-400'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <Users className="h-6 w-6 mx-auto mb-2 text-gray-600 dark:text-gray-400" />
                    <div className="font-semibold text-gray-900 dark:text-white">{option.label}</div>
                    {option.count === 'custom' && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">1-10 VMs</div>
                    )}
                    {option.count === '20+' && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Contact Us</div>
                    )}
                    {!option.isCustom && selectedPlanType && pricingMatrix[selectedPlanType]?.[option.count] && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        ${pricingMatrix[selectedPlanType][option.count].perVM}/VM
                      </div>
                    )}
                    {option.count === 'custom' && selectedPlanType && (
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Custom pricing
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Custom VM Count Input */}
              {selectedVMCount === 'custom' && (
                <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
                    Choose VM Quantity (1-10)
                  </h4>
                  
                  <div className="flex items-center justify-center space-x-4 mb-6">
                    <button
                      type="button"
                      onClick={() => customVMCount > 1 && setCustomVMCount(customVMCount - 1)}
                      disabled={customVMCount <= 1}
                      className="w-10 h-10 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded-full font-bold text-lg disabled:cursor-not-allowed transition-colors"
                    >
                      −
                    </button>

                    <div className="text-center">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={customVMCount}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (value >= 1 && value <= 10) {
                            setCustomVMCount(value);
                          }
                        }}
                        onBlur={(e) => {
                          const value = parseInt(e.target.value);
                          if (isNaN(value) || value < 1) {
                            setCustomVMCount(1);
                          } else if (value > 10) {
                            setCustomVMCount(10);
                          }
                        }}
                        className="w-20 h-12 text-2xl font-bold text-center border-2 border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {customVMCount === 1 ? 'VM' : 'VMs'}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => customVMCount < 10 && setCustomVMCount(customVMCount + 1)}
                      disabled={customVMCount >= 10}
                      className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-full font-bold text-lg disabled:cursor-not-allowed transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {selectedPlanType && getCurrentPricing() && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">Monthly Total</div>
                          <div className="text-xl font-bold text-gray-900 dark:text-white">
                            ${getCurrentPricing().price}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600 dark:text-gray-400">Per VM</div>
                          <div className="text-lg font-semibold text-gray-900 dark:text-white">
                            ${getCurrentPricing().perVM}
                          </div>
                        </div>
                      </div>
                      {customVMCount > 1 && (
                        <div className="mt-3 text-sm text-green-600 dark:text-green-400 text-center">
                          💰 Volume discount: Save ${(pricingMatrix[selectedPlanType][1].perVM - getCurrentPricing().perVM)} per VM!
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back: Plan Type
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!selectedVMCount}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Next: Review & Subscribe
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Subscribe */}
          {currentStep === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                {subscription && subscription.plan !== 'none' && subscription.stripeSubscriptionId 
                  ? 'Review Your Upgrade' : 'Review Your Selection'}
              </h3>
              
              {/* Show current vs new plan comparison for upgrades */}
              {subscription && subscription.plan !== 'none' && subscription.stripeSubscriptionId && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-700">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Subscription Upgrade
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-600">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Current Plan</div>
                      <div className="font-medium text-gray-900 dark:text-white">{subscription.plan}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">Will be replaced</div>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/30 rounded-md p-3 border border-blue-300 dark:border-blue-600">
                      <div className="text-sm text-blue-600 dark:text-blue-400">New Plan</div>
                      <div className="font-medium text-blue-900 dark:text-blue-100">
                        {planTypes.find(p => p.id === selectedPlanType)?.name}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">Effective immediately</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> The price difference will be prorated for your current billing cycle. 
                    You'll see the adjustment on your next invoice.
                  </div>
                </div>
              )}
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Selected Plan</h4>
                    <div className="flex items-center space-x-3">
                      {planTypes.find(p => p.id === selectedPlanType)?.icon}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {planTypes.find(p => p.id === selectedPlanType)?.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {planTypes.find(p => p.id === selectedPlanType)?.specs}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">VM Quantity</h4>
                    <div className="flex items-center space-x-3">
                      <Users className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {selectedVMCount === 'custom' ? `${customVMCount} VMs` : 
                           selectedVMCount === '20+' ? '20+ VMs' : 
                           `${selectedVMCount} VM${selectedVMCount > 1 ? 's' : ''}`}
                        </div>
                        {selectedVMCount !== '20+' && getCurrentPricing() && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            ${getCurrentPricing().perVM} per VM
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedVMCount === '20+' ? (
                  <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                      <div>
                        <div className="font-medium text-blue-900 dark:text-blue-100">Custom Pricing Required</div>
                        <div className="text-sm text-blue-700 dark:text-blue-200">
                          For 20+ VMs, please contact our sales team for custom pricing and enterprise features.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Monthly Total</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                          <DollarSign className="h-6 w-6" />
                          {getCurrentPricing()?.price}
                          <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">/month</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-600 dark:text-gray-400">Per VM Cost</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">
                          ${getCurrentPricing()?.perVM}/VM
                        </div>
                      </div>
                    </div>
                    
                    {selectedVMCount > 1 && selectedVMCount !== '20+' && selectedVMCount !== 'custom' && (
                      <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                        💰 Volume discount: Save ${(pricingMatrix[selectedPlanType][1].perVM - getCurrentPricing()?.perVM)} per VM!
                      </div>
                    )}
                    {selectedVMCount === 'custom' && customVMCount > 1 && (
                      <div className="mt-2 text-sm text-green-600 dark:text-green-400">
                        💰 Volume discount: Save ${(pricingMatrix[selectedPlanType][1].perVM - getCurrentPricing()?.perVM)} per VM!
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-6 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back: VM Quantity
                </button>
                
                {selectedVMCount === '20+' ? (
                  <button
                    onClick={() => showToast('Please contact our sales team at sales@tarkovboost.pro for custom pricing', 'info')}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Contact Sales
                  </button>
                ) : (
                  <button
                    onClick={handleSubscribe}
                    disabled={processing}
                    className={`px-6 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center ${
                      subscription && subscription.plan !== 'none' && subscription.stripeSubscriptionId
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                    }`}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : subscription && subscription.plan !== 'none' && subscription.stripeSubscriptionId ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Upgrade Subscription
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Subscribe Now
                      </>
                    )}
                  </button>
                )}
                </div>
          </div>
          )}
        </div>
      )}

      {/* Payment Info */}
      {!isAdmin && (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 transition-colors duration-200">Payment Information</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 transition-colors duration-200">
          <p>• Payments are processed securely through Stripe</p>
          <p>• Your VMs will be activated immediately after successful payment</p>
          <p>• You can cancel or change your subscription at any time</p>
          <p>• All payments are automatically recurring unless cancelled</p>
          <p>• Volume discounts apply automatically for multiple VMs</p>
        </div>
      </div>
      )}

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