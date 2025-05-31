import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VMCard from './VMCard';
import VMSetup from './VMSetup';
import DashboardStats from './DashboardStats';
import ServerOverview from './ServerOverview';
import { RefreshCw, AlertCircle, Monitor, Loader2, CheckCircle, Clock, Cpu, HardDrive, CreditCard, Server, Users, BarChart3, Settings, Play, Activity } from 'lucide-react';
import SubscriptionManager from './SubscriptionManager';
import AdminPanel from './AdminPanel';
import Analytics from './Analytics';
import SystemMonitoringModal from './SystemMonitoringModal';

const Dashboard = () => {
  const { user } = useAuth();
  const [vms, setVMs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('vms');
  const [serverStats, setServerStats] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [subscriptionInfo, setSubscriptionInfo] = useState(null);
  const [setupInfo, setSetupInfo] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  
  // Add state to prevent API loops
  const [fetchingVMs, setFetchingVMs] = useState(false);
  const [fetchingStats, setFetchingStats] = useState(false);
  const [fetchingServerStats, setFetchingServerStats] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);

  // Monitoring state
  const [monitoringData, setMonitoringData] = useState({
    systemHealth: null,
    vmProvisioning: null,
    webhooks: null,
    userActivity: null,
    loading: {
      systemHealth: false,
      vmProvisioning: false, 
      webhooks: false,
      userActivity: false
    }
  });
  const [activeMonitoringTab, setActiveMonitoringTab] = useState('system');

  const fetchVMs = async () => {
    // Prevent infinite loops - don't fetch if already fetching or fetched recently
    const now = Date.now();
    if (fetchingVMs || (now - lastFetchTime < 2000)) { // 2 second minimum between calls
      console.log('🛑 VM fetch prevented - already in progress or too recent');
      return;
    }
    
    try {
      setFetchingVMs(true);
      setError('');
      console.log('🔄 Fetching VMs...');
      const response = await api.get('/vm');
      setVMs(response.data.vms || []);
      setSubscriptionInfo(response.data.subscription || null);
      setSetupInfo(response.data.setup || null);
      setLastFetchTime(now);
      console.log('✅ VMs fetched successfully');
    } catch (error) {
      console.error('Error fetching VMs:', error);
      setError(error.response?.data?.error || 'Failed to fetch VMs');
    } finally {
      setFetchingVMs(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/user/dashboard');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchServerStats = async () => {
    try {
      const response = await api.get('/vm/server-overview');
      setServerStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching server stats:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchVMs(), fetchStats(), fetchServerStats()]);
    setRefreshing(false);
  };

  const handleVMAction = async (vmId, action) => {
    setActionLoading(prev => ({ ...prev, [`${vmId}-${action}`]: true }));
    
    try {
      await api.post(`/vm/${vmId}/${action}`);
      
      // Show success message
      const actionMessages = {
        start: 'VM start command sent',
        stop: 'VM stop command sent',
        shutdown: 'VM shutdown command sent',
        reboot: 'VM reboot command sent'
      };
      
      // Optionally show a toast notification here
      console.log(actionMessages[action]);
      
      // Refresh VMs after a short delay to see status change
      setTimeout(() => {
        fetchVMs();
      }, 2000);
      
    } catch (error) {
      console.error(`Error ${action} VM:`, error);
      setError(error.response?.data?.error || `Failed to ${action} VM`);
    } finally {
      setActionLoading(prev => ({ ...prev, [`${vmId}-${action}`]: false }));
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchVMs(), fetchStats(), fetchServerStats()]);
      setLoading(false);
    };

    loadData();
  }, []);

  // Handle URL parameters for payment success/failure
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    const success = urlParams.get('success');
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    // Set active tab if specified in URL
    if (tab && ['vms', 'subscription', 'admin', 'analytics'].includes(tab)) {
      setActiveTab(tab);
    }

    // Handle payment success
    if (success === 'true' && sessionId) {
      console.log('🎉 Payment successful, verifying session and refreshing data...');
      
      // Set subscription tab as active
      setActiveTab('subscription');
      
      // Verify payment and refresh all data
      verifyPaymentAndRefresh(sessionId);
      
      // Clean up URL without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    // Handle payment cancellation
    if (canceled === 'true') {
      console.log('❌ Payment was canceled');
      setActiveTab('subscription');
      
      // Clean up URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, []);

  // Function to verify payment and refresh subscription data
  const verifyPaymentAndRefresh = async (sessionId) => {
    try {
      console.log('🔍 Verifying payment session:', sessionId);
      
      // Call verify endpoint
      const response = await api.post('/payment/verify-checkout-session', {
        sessionId: sessionId
      });
      
      if (response.data.success) {
        console.log('✅ Payment verified successfully');
        
        // Single refresh to show updated subscription
        await handleRefresh();
        
        console.log('✅ Payment verification and refresh completed');
      }
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      setError('Payment verification failed. Please refresh the page.');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Monitoring functions
  const fetchMonitoringData = async (type) => {
    setMonitoringData(prev => ({
      ...prev,
      loading: { ...prev.loading, [type]: true }
    }));

    try {
      const response = await api.get(`/admin/monitoring/${type === 'system' ? 'system-health' : type === 'provisioning' ? 'vm-provisioning' : type === 'webhooks' ? 'webhooks' : 'user-activity'}`);
      
      if (response.data) {
        setMonitoringData(prev => ({
          ...prev,
          [type === 'system' ? 'systemHealth' : type === 'provisioning' ? 'vmProvisioning' : type === 'webhooks' ? 'webhooks' : 'userActivity']: response.data
        }));
      }
    } catch (error) {
      console.error(`Error fetching ${type} data:`, error);
    } finally {
      setMonitoringData(prev => ({
        ...prev,
        loading: { ...prev.loading, [type]: false }
      }));
    }
  };

  const refreshMonitoringData = () => {
    fetchMonitoringData(activeMonitoringTab);
  };

  const tabs = [
    { id: 'vms', label: 'Virtual Machines', icon: Monitor },
    { id: 'subscription', label: 'Subscription', icon: CreditCard }
  ];

  // Add admin and analytics tabs only for admin users
  if (user?.role === 'admin') {
    tabs.push({ id: 'admin', label: 'User Management', icon: Users });
    tabs.push({ id: 'analytics', label: 'Analytics', icon: BarChart3 });
    tabs.push({ id: 'system-monitoring', label: 'System Monitor', icon: Activity });
  }

  const renderVMDashboard = () => (
    <div className="space-y-6">
      {/* Server Stats for Admin */}
      {user?.role === 'admin' && serverStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center transition-colors duration-200">
              <Server className="h-5 w-5 mr-2" />
              Server Overview
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">CPU Usage</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-200">{(serverStats.cpu * 100).toFixed(1)}%</p>
                  </div>
                  <Cpu className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              
              <div className="bg-green-50 dark:bg-green-900 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900 dark:text-green-300">Memory</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-200">{((serverStats.memory.used / serverStats.memory.total) * 100).toFixed(1)}%</p>
                    <p className="text-xs text-green-700 dark:text-green-400">{formatBytes(serverStats.memory.used)} / {formatBytes(serverStats.memory.total)}</p>
                  </div>
                  <HardDrive className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              
              <div className="bg-purple-50 dark:bg-purple-900 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-300">I/O Delay</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-200">{(serverStats.iodelay * 100).toFixed(2)}%</p>
                  </div>
                  <Clock className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              
              <div className="bg-orange-50 dark:bg-orange-900 rounded-lg p-4 transition-colors duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-900 dark:text-orange-300">Uptime</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-200">{Math.floor(serverStats.uptime / 86400)}d</p>
                    <p className="text-xs text-orange-700 dark:text-orange-400">{Math.floor((serverStats.uptime % 86400) / 3600)}h {Math.floor((serverStats.uptime % 3600) / 60)}m</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VM Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-200">Virtual Machines</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors duration-200">
            {user?.role === 'admin' ? 'Manage all virtual machines' : 'Manage your assigned virtual machines'}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4 flex items-center transition-colors duration-200">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
              <span className="text-red-700 dark:text-red-300">{error}</span>
            </div>
          </div>
        ) : vms.length === 0 ? (
          <div className="p-6 text-center">
            <Monitor className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4 transition-colors duration-200" />
            <p className="text-gray-500 dark:text-gray-400 transition-colors duration-200">
              {setupInfo?.message || 'No virtual machines assigned to your account.'}
            </p>
            {user?.role !== 'admin' && !subscriptionInfo?.hasActive && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 transition-colors duration-200">
                Purchase a subscription to get started with your VMs.
              </p>
            )}
          </div>
        ) : setupInfo?.required ? (
          // Show setup wizard when setup is required
          <div className="p-6">
            <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Settings className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                      VM Setup Required
                    </h3>
                    <p className="text-blue-800 dark:text-blue-200">
                      Your {setupInfo.vmCount} VM{setupInfo.vmCount > 1 ? 's are' : ' is'} ready for setup. 
                      Complete the setup process to start using your VMs.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSetup(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Setup
                </button>
              </div>
            </div>
            
            {/* Show VMs grid below setup message */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {vms.map((vm) => (
                <VMCard
                  key={vm.vmid}
                  vm={vm}
                  onAction={handleVMAction}
                  actionLoading={actionLoading}
                  subscriptionInfo={subscriptionInfo}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {vms.map((vm) => (
                <VMCard
                  key={vm.vmid}
                  vm={vm}
                  onAction={handleVMAction}
                  actionLoading={actionLoading}
                  subscriptionInfo={subscriptionInfo}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
            Welcome back, {user?.username}!
          </h1>
          <p className="text-gray-600 dark:text-gray-400 transition-colors duration-200">
            Manage your virtual machines
          </p>
        </div>
        
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors duration-200"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && <DashboardStats stats={{...stats, userRole: stats.role || user?.role}} />}

      {/* Server Overview - Admin Only */}
      {user?.role === 'admin' && <ServerOverview />}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4 transition-colors duration-200">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                // Load monitoring data when system monitoring tab is clicked
                if (tab.id === 'system-monitoring' && !monitoringData.systemHealth) {
                  fetchMonitoringData('system');
                }
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center transition-colors duration-200 ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'vms' && renderVMDashboard()}
      {activeTab === 'subscription' && <SubscriptionManager />}
      {activeTab === 'admin' && <AdminPanel />}
      {activeTab === 'analytics' && <Analytics />}
      {activeTab === 'system-monitoring' && (
        <SystemMonitoringModal
          show={true}
          onClose={() => {}} // No close needed since it's in a tab
          monitoringData={monitoringData}
          activeTab={activeMonitoringTab}
          onTabChange={(tab) => {
            setActiveMonitoringTab(tab);
            fetchMonitoringData(tab);
          }}
          onRefresh={refreshMonitoringData}
          embedded={true} // Tell component it's embedded in tab
        />
      )}

      {/* VM Setup Modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                VM Setup Wizard
              </h2>
              <button
                onClick={() => setShowSetup(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <VMSetup 
              setupInfo={setupInfo} 
              onComplete={() => {
                setShowSetup(false);
                handleRefresh(); // Refresh to update VM status
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 