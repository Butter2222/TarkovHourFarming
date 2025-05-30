import React from 'react';
import { Monitor, Calendar, Shield, Clock } from 'lucide-react';

const DashboardStats = ({ stats }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getSubscriptionStatus = (subscription) => {
    // If no subscription plan at all
    if (!subscription || !subscription.plan || subscription.plan === 'none') {
      return { text: 'No Subscription', color: 'text-gray-600', bg: 'bg-gray-100' };
    }

    // If subscription plan exists but no expiry date
    if (!subscription.expiresAt) {
      return { text: 'Active', color: 'text-green-600', bg: 'bg-green-100' };
    }

    const expiryDate = new Date(subscription.expiresAt);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { text: 'Expired', color: 'text-red-600', bg: 'bg-red-100' };
    } else {
      return { text: 'Active', color: 'text-green-600', bg: 'bg-green-100' };
    }
  };

  const getSubscriptionDetails = (subscription) => {
    if (!subscription || !subscription.plan || subscription.plan === 'none') {
      return { plan: 'None', dateText: null };
    }

    if (!subscription.expiresAt) {
      return { plan: subscription.plan, dateText: null };
    }

    const expiryDate = new Date(subscription.expiresAt);
    const now = new Date();
    const isExpired = expiryDate < now;
    
    const dateText = isExpired 
      ? `Expired ${expiryDate.toLocaleDateString()}`
      : `Renews ${expiryDate.toLocaleDateString()}`;

    return { plan: subscription.plan, dateText };
  };

  const subscriptionStatus = getSubscriptionStatus(stats.subscription);
  const subscriptionDetails = getSubscriptionDetails(stats.subscription);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <div className="flex items-center">
          <div className="h-12 w-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Monitor className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-200">Total VMs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">{stats.totalVMs}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <div className="flex items-center">
          <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-200">Subscription</p>
            <div className="flex items-center space-x-2">
              <p className="text-lg font-semibold text-gray-900 dark:text-white capitalize transition-colors duration-200">
                {subscriptionDetails.plan}
              </p>
              {subscriptionDetails.plan !== 'None' && (
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${subscriptionStatus.bg} ${subscriptionStatus.color}`}>
                  {subscriptionStatus.text}
                </span>
              )}
            </div>
            {subscriptionDetails.dateText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 transition-colors duration-200">
                {subscriptionDetails.dateText}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <div className="flex items-center">
          <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Calendar className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-200">Member Since</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-200">
              {formatDate(stats.accountCreated)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <div className="flex items-center">
          <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 transition-colors duration-200">Last Login</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-200">
              {formatDate(stats.lastLogin)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardStats; 