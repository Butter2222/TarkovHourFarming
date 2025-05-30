import React, { useState, useEffect } from 'react';
import { Server, Cpu, HardDrive, Clock, Activity, AlertCircle } from 'lucide-react';

const ServerOverview = () => {
  const [serverData, setServerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchServerOverview = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/vm/server-overview', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch server overview');
      }

      const data = await response.json();
      setServerData(data.server);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching server overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServerOverview();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchServerOverview, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (usage) => {
    if (usage > 80) return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900';
    if (usage > 60) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900';
    return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900';
  };

  const getProgressColor = (usage) => {
    if (usage > 80) return 'bg-red-500 dark:bg-red-400';
    if (usage > 60) return 'bg-yellow-500 dark:bg-yellow-400';
    return 'bg-green-500 dark:bg-green-400';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="flex items-center space-x-3 mb-4">
          <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Server Overview</h2>
        </div>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded transition-colors duration-200"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="flex items-center space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Server Overview</h2>
        </div>
        <div className="text-red-600 dark:text-red-400 text-sm">
          Error loading server data: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Server className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Server Overview</h2>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Node: {serverData?.node} • {serverData?.status}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* CPU Usage */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">CPU</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${getStatusColor(serverData?.cpu?.usage || 0)}`}>
              {serverData?.cpu?.usage || 0}%
            </span>
          </div>
          <div className="mb-2">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 transition-colors duration-200">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(serverData?.cpu?.usage || 0)}`}
                style={{ width: `${serverData?.cpu?.usage || 0}%` }}
              ></div>
            </div>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {serverData?.cpu?.cores || 'N/A'} cores
          </div>
        </div>

        {/* Memory Usage */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <HardDrive className="h-5 w-5 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Memory</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${getStatusColor(serverData?.memory?.usage || 0)}`}>
              {serverData?.memory?.usage || 0}%
            </span>
          </div>
          <div className="mb-2">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 transition-colors duration-200">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(serverData?.memory?.usage || 0)}`}
                style={{ width: `${serverData?.memory?.usage || 0}%` }}
              ></div>
            </div>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {serverData?.memory?.used || 0} GB / {serverData?.memory?.total || 0} GB
          </div>
        </div>

        {/* IO Delay */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors duration-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">I/O Delay</span>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full transition-colors duration-200 ${getStatusColor(serverData?.iowait || 0)}`}>
              {serverData?.iowait || 0}%
            </span>
          </div>
          <div className="mb-2">
            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 transition-colors duration-200">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(serverData?.iowait || 0)}`}
                style={{ width: `${Math.min(serverData?.iowait || 0, 100)}%` }}
              ></div>
            </div>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            Load: {serverData?.loadavg?.[0] && typeof serverData.loadavg[0] === 'number' 
              ? serverData.loadavg[0].toFixed(2) 
              : 'N/A'
            }
          </div>
        </div>

        {/* Uptime */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors duration-200">
          <div className="flex items-center space-x-2 mb-3">
            <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Uptime</span>
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {serverData?.uptime || 'Unknown'}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            System running
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600 transition-colors duration-200">
        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>Proxmox: {serverData?.pveVersion || 'Unknown'}</span>
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default ServerOverview; 