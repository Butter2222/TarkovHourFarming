import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VMCard from './VMCard';
import DashboardStats from './DashboardStats';
import ServerOverview from './ServerOverview';
import { RefreshCw, AlertCircle, Monitor, Loader2, CheckCircle, Clock, Cpu, HardDrive, CreditCard, Server, Users, BarChart3 } from 'lucide-react';
import SubscriptionManager from './SubscriptionManager';
import AdminPanel from './AdminPanel';
import Analytics from './Analytics';

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

  const fetchVMs = async () => {
    try {
      setError('');
      const response = await api.get('/vm');
      setVMs(response.data.vms || []);
    } catch (error) {
      console.error('Error fetching VMs:', error);
      setError(error.response?.data?.error || 'Failed to fetch VMs');
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

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const tabs = [
    { id: 'vms', label: 'Virtual Machines', icon: Monitor },
    { id: 'subscription', label: 'Subscription', icon: CreditCard }
  ];

  // Add admin and analytics tabs only for admin users
  if (user?.role === 'admin') {
    tabs.push({ id: 'admin', label: 'User Management', icon: Users });
    tabs.push({ id: 'analytics', label: 'Analytics', icon: BarChart3 });
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
            <p className="text-gray-500 dark:text-gray-400 transition-colors duration-200">No virtual machines assigned to your account.</p>
            {user?.role !== 'admin' && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 transition-colors duration-200">Contact support to get VMs assigned to your account.</p>
            )}
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
      {stats && <DashboardStats stats={stats} />}

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
              onClick={() => setActiveTab(tab.id)}
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
    </div>
  );
};

export default Dashboard; 