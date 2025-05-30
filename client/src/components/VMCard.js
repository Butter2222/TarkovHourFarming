import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Power, 
  RotateCcw, 
  Monitor, 
  Cpu, 
  HardDrive,
  Clock
} from 'lucide-react';

const VMCard = ({ vm, onAction }) => {
  const [actionLoading, setActionLoading] = useState('');

  const handleAction = async (action) => {
    setActionLoading(action);
    try {
      await onAction(vm.vmid, action);
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
      <div className="grid grid-cols-2 gap-2">
        {isStopped ? (
          <button
            onClick={() => handleAction('start')}
            disabled={actionLoading === 'start'}
            className="btn-success text-sm flex items-center justify-center h-9"
          >
            {actionLoading === 'start' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Play className="h-4 w-4 mr-1" />
                Start
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => handleAction('shutdown')}
            disabled={actionLoading === 'shutdown'}
            className="btn-secondary text-sm flex items-center justify-center h-9"
          >
            {actionLoading === 'shutdown' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-gray-400"></div>
            ) : (
              <>
                <Power className="h-4 w-4 mr-1" />
                Shutdown
              </>
            )}
          </button>
        )}

        {isRunning ? (
          <button
            onClick={() => handleAction('stop')}
            disabled={actionLoading === 'stop'}
            className="btn-danger text-sm flex items-center justify-center h-9"
          >
            {actionLoading === 'stop' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <>
                <Square className="h-4 w-4 mr-1" />
                Stop
              </>
            )}
          </button>
        ) : (
          <button
            onClick={() => handleAction('reboot')}
            disabled={actionLoading === 'reboot' || isStopped}
            className="btn-secondary text-sm flex items-center justify-center disabled:opacity-50 h-9"
          >
            {actionLoading === 'reboot' ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-gray-400"></div>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reboot
              </>
            )}
          </button>
        )}
      </div>

      {/* Error indicator */}
      {vm.error && (
        <div className="mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900 px-2 py-1 rounded transition-colors duration-200">
          {vm.error}
        </div>
      )}
    </div>
  );
};

export default VMCard; 