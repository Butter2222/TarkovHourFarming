import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Power, 
  RotateCcw, 
  Monitor, 
  Cpu, 
  HardDrive,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Toast from './Toast';

const VMCard = ({ vm, onAction, subscriptionInfo }) => {
  const { user } = useAuth();
  const [actionLoading, setActionLoading] = useState('');
  const [showSubscriptionWarning, setShowSubscriptionWarning] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
  };

  const hideToast = () => {
    setToast({ show: false, message: '', type: 'success' });
  };

  const handleAction = async (action) => {
    // Check VM-specific permissions from server
    const canPerformAction = 
      (action === 'start' && vm.canStart) ||
      (action === 'reboot' && vm.canReboot) ||
      (action === 'stop' && vm.canStop) ||
      (action === 'shutdown' && vm.canShutdown);

    if (!canPerformAction) {
      setShowSubscriptionWarning(action);
      setTimeout(() => setShowSubscriptionWarning(''), 3000);
      return;
    }

    setActionLoading(action);
    
    try {
      await onAction(vm.vmid, action);
      
      // Show success toast based on action
      const actionMessages = {
        start: `VM ${vm.vmid} is starting up...`,
        shutdown: `VM ${vm.vmid} is shutting down gracefully...`,
        reboot: `VM ${vm.vmid} is restarting...`,
        stop: `VM ${vm.vmid} has been force stopped...`
      };
      
      showToast(actionMessages[action], 'success');
      
    } catch (error) {
      // Show error toast
      const errorMessage = error.response?.data?.error || `Failed to ${action} VM ${vm.vmid}`;
      showToast(errorMessage, 'error');
    } finally {
      setActionLoading('');
    }
  };

  const getStatusBadge = (status) => {
    const statusLower = status?.toLowerCase() || 'unknown';
    
    switch (statusLower) {
      case 'running':
        return <span className="status-running">Running</span>;
      case 'stopped':
        return <span className="status-stopped">Stopped</span>;
      case 'paused':
        return <span className="status-paused">Paused</span>;
      default:
        return <span className="status-unknown">Unknown</span>;
    }
  };

  const formatUptime = (uptime) => {
    if (!uptime) return 'N/A';
    
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatMemory = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const status = vm.detailedStatus?.status || vm.status;
  const isRunning = status?.toLowerCase() === 'running';
  const isStopped = status?.toLowerCase() === 'stopped';

  // Get subscription restrictions message
  const getSubscriptionMessage = (action) => {
    if (!subscriptionInfo?.restrictions) return null;
    
    if (subscriptionInfo.restrictions.blockedOperations.includes(action)) {
      return subscriptionInfo.restrictions.message;
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="h-10 w-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center transition-colors duration-200">
            <Monitor className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white transition-colors duration-200">
              {vm.name || `VM-${vm.vmid}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">ID: {vm.vmid}</p>
          </div>
        </div>
        {getStatusBadge(status)}
      </div>

      {/* Subscription Warning */}
      {subscriptionInfo?.restrictions && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mr-2" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {subscriptionInfo.restrictions.message}
            </p>
          </div>
        </div>
      )}

      {/* VM Stats */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
          <Cpu className="h-4 w-4 mr-2" />
          <span>
            CPU: {vm.detailedStatus?.cpu ? `${(vm.detailedStatus.cpu * 100).toFixed(1)}%` : 'N/A'}
          </span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
          <HardDrive className="h-4 w-4 mr-2" />
          <span>
            Memory: {formatMemory(vm.detailedStatus?.mem)} / {formatMemory(vm.detailedStatus?.maxmem)}
          </span>
        </div>
        
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 transition-colors duration-200">
          <Clock className="h-4 w-4 mr-2" />
          <span>
            Uptime: {isRunning ? formatUptime(vm.detailedStatus?.uptime) : 'Stopped'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      {isStopped ? (
        // When VM is stopped - only show Start button
        <div className="w-full">
          <button
            onClick={() => handleAction('start')}
            disabled={actionLoading === 'start' || !vm.canStart}
            className={`
              w-full px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 
              flex items-center justify-center border-2 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${vm.canStart 
                ? 'bg-green-700 hover:bg-green-800 border-green-700 hover:border-green-800 text-white focus:ring-green-500' 
                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }
            `}
            title={!vm.canStart ? getSubscriptionMessage('start') || 'Start requires active subscription' : 'Start VM'}
          >
            {actionLoading === 'start' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/70 border-t-white"></div>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start VM
                {!vm.canStart && <AlertTriangle className="h-4 w-4 ml-2 opacity-70" />}
              </>
            )}
          </button>
        </div>
      ) : (
        // When VM is running - show Shutdown and Restart buttons
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleAction('shutdown')}
            disabled={actionLoading === 'shutdown' || !vm.canShutdown}
            className={`
              px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 
              flex items-center justify-center border-2 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${vm.canShutdown 
                ? 'bg-red-800 hover:bg-red-900 border-red-800 hover:border-red-900 text-white focus:ring-red-500' 
                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }
            `}
            title={!vm.canShutdown ? 'Shutdown not available' : 'Graceful shutdown'}
          >
            {actionLoading === 'shutdown' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/70 border-t-white"></div>
            ) : (
              <>
                <Power className="h-4 w-4 mr-1.5" />
                Shutdown
              </>
            )}
          </button>

          <button
            onClick={() => handleAction('reboot')}
            disabled={actionLoading === 'reboot' || !vm.canReboot}
            className={`
              px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 
              flex items-center justify-center border-2 focus:outline-none focus:ring-2 focus:ring-offset-2
              ${vm.canReboot 
                ? 'bg-blue-700 hover:bg-blue-800 border-blue-700 hover:border-blue-800 text-white focus:ring-blue-500' 
                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }
            `}
            title={!vm.canReboot ? getSubscriptionMessage('reboot') || 'Restart requires active subscription' : 'Restart VM'}
          >
            {actionLoading === 'reboot' ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/70 border-t-white"></div>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Restart
                {!vm.canReboot && <AlertTriangle className="h-4 w-4 ml-1.5 opacity-70" />}
              </>
            )}
          </button>
        </div>
      )}

      {/* Error indicator */}
      {vm.error && (
        <div className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900 px-2 py-1 rounded transition-colors duration-200">
          {vm.error}
        </div>
      )}

      {/* Subscription warning */}
      {showSubscriptionWarning && (
        <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900 px-2 py-1 rounded transition-colors duration-200">
          {getSubscriptionMessage(showSubscriptionWarning) || `Cannot ${showSubscriptionWarning} VM - action not permitted.`}
        </div>
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        show={toast.show}
        onClose={hideToast}
        type={toast.type}
      />
    </div>
  );
};

export default VMCard; 