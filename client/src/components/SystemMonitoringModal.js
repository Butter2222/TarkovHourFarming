import React from 'react';
import { 
  XCircle, 
  Activity, 
  Server, 
  TrendingUp, 
  Users, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  Cpu, 
  HardDrive, 
  Database,
  Zap,
  Clock,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

const SystemMonitoringModal = ({ show, onClose, monitoringData, activeTab, onTabChange, onRefresh, embedded = false }) => {
  if (!show && !embedded) return null;

  const tabs = [
    { id: 'system', label: 'System Health', icon: <Server className="h-4 w-4" /> },
    { id: 'provisioning', label: 'VM Provisioning', icon: <Activity className="h-4 w-4" /> },
    { id: 'webhooks', label: 'Webhooks', icon: <Zap className="h-4 w-4" /> },
    { id: 'activity', label: 'User Activity', icon: <Users className="h-4 w-4" /> }
  ];

  const getAlertIcon = (type) => {
    switch (type) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const content = (
    <div className={`bg-white dark:bg-gray-800 ${embedded ? 'rounded-lg shadow-sm border border-gray-200 dark:border-gray-700' : 'rounded-xl shadow-2xl'} ${embedded ? '' : 'max-w-6xl w-full max-h-[90vh]'} overflow-hidden`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b border-gray-200 dark:border-gray-600 ${embedded ? 'bg-gray-50 dark:bg-gray-700' : 'bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900 dark:to-blue-900'}`}>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Monitoring</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Production Dashboard
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onRefresh}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
              title="Refresh Data"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            {!embedded && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
              >
                <XCircle className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
        <nav className="flex space-x-1 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-3 px-4 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-green-500 text-green-600 dark:border-green-400 dark:text-green-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className={`p-6 overflow-y-auto ${embedded ? 'max-h-screen' : ''}`} style={embedded ? {} : { maxHeight: 'calc(90vh - 200px)' }}>
        {/* System Health Tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {monitoringData.loading.systemHealth ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            ) : monitoringData.systemHealth ? (
              <>
                {/* Alerts */}
                {monitoringData.systemHealth.alerts && monitoringData.systemHealth.alerts.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-600 rounded-lg p-4">
                    <h3 className="font-medium text-yellow-900 dark:text-yellow-200 mb-3 flex items-center">
                      <AlertTriangle className="h-5 w-5 mr-2" />
                      System Alerts
                    </h3>
                    <div className="space-y-2">
                      {monitoringData.systemHealth.alerts.map((alert, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          {getAlertIcon(alert.type)}
                          <span className="text-sm">{alert.message}</span>
                          <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                            {alert.component}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* System Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Proxmox Node */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <Server className="h-5 w-5 mr-2 text-blue-600" />
                      Proxmox Node: {monitoringData.systemHealth.system.proxmox.node}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">CPU Usage</span>
                        <div className="flex items-center space-x-2">
                          <Cpu className="h-4 w-4 text-blue-500" />
                          <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.proxmox.cpu.usage}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${monitoringData.systemHealth.system.proxmox.cpu.usage}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Memory Usage</span>
                        <div className="flex items-center space-x-2">
                          <HardDrive className="h-4 w-4 text-green-500" />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {monitoringData.systemHealth.system.proxmox.memory.used}GB / {monitoringData.systemHealth.system.proxmox.memory.total}GB
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${monitoringData.systemHealth.system.proxmox.memory.usage}%` }}
                        ></div>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Uptime</span>
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-purple-500" />
                          <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.proxmox.uptime}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Database */}
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                      <Database className="h-5 w-5 mr-2 text-purple-600" />
                      Database Statistics
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Total Users</span>
                        <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.database.users}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Active Subscriptions</span>
                        <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.database.activeSubscriptions}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Running VMs</span>
                        <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.database.totalVMs}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Templates</span>
                        <span className="font-medium text-gray-900 dark:text-white">{monitoringData.systemHealth.system.database.templates}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                    <h3 className="font-medium text-gray-900 dark:text-white">Recent System Activity (24h)</h3>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {monitoringData.systemHealth.activity.recentActions.map((action, index) => (
                      <div key={`${action.action}-${action.resource_type}-${index}`} className="px-4 py-3 border-b border-gray-100 dark:border-gray-600 last:border-b-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {action.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                          <span className="text-xs text-white dark:text-gray-900 bg-blue-600 dark:bg-blue-400 px-3 py-1 rounded-full font-semibold">
                            {action.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">No system health data available</div>
            )}
          </div>
        )}

        {/* VM Provisioning Tab */}
        {activeTab === 'provisioning' && (
          <div className="space-y-6">
            {monitoringData.loading.vmProvisioning ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            ) : monitoringData.vmProvisioning ? (
              <>
                {/* Provisioning History */}
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                    <h3 className="font-medium text-gray-900 dark:text-white">VM Provisioning History</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-50 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Account ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Action</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Details</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                        {monitoringData.vmProvisioning.provisioningHistory
                          .filter((log, index, array) => {
                            // Remove duplicates based on user_id, action, and timestamp
                            return array.findIndex(l => 
                              l.user_id === log.user_id && 
                              l.action === log.action && 
                              Math.abs(new Date(l.timestamp) - new Date(log.timestamp)) < 60000 // Within 1 minute
                            ) === index;
                          })
                          .slice(0, 20)
                          .map((log) => (
                          <tr key={`${log.id}-${log.user_id}-${log.timestamp}`} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{log.username}</td>
                            <td className="px-4 py-3 text-sm font-mono text-blue-600 dark:text-blue-400">{log.userAccountId}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                log.action.includes('failed') 
                                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
                                  : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                              }`}>
                                {log.action.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                              {log.details.planType && `Plan: ${log.details.planType}`}
                              {log.details.vmsCreated && ` | VMs: ${log.details.vmsCreated.length || log.details.vmsCreated}`}
                              {log.details.vmCount && ` | Count: ${log.details.vmCount}`}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">No provisioning data available</div>
            )}
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            {monitoringData.loading.webhooks ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            ) : monitoringData.webhooks ? (
              <>
                {/* Webhook Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-blue-600 dark:text-blue-300">Last 24 Hours</span>
                      <Zap className="h-5 w-5 text-blue-500" />
                    </div>
                    <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {monitoringData.webhooks.summary.last24Hours}
                    </span>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-600 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-green-600 dark:text-green-300">Success Rate</span>
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    </div>
                    <span className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {monitoringData.webhooks.summary.successRate}
                    </span>
                  </div>
                </div>

                {/* Recent Webhooks */}
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                    <h3 className="font-medium text-gray-900 dark:text-white">Recent Webhook Events</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {monitoringData.webhooks.recentWebhooks.slice(0, 20).map((webhook) => (
                      <div key={webhook.id} className="px-4 py-3 border-b border-gray-100 dark:border-gray-600 last:border-b-0">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                webhook.action.includes('failed')
                                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'
                                  : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300'
                              }`}>
                                {webhook.action.replace(/_/g, ' ')}
                              </span>
                              <span className="text-sm text-gray-900 dark:text-white">{webhook.resource_type}</span>
                            </div>
                            {webhook.details.eventType && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Event: {webhook.details.eventType}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(webhook.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">No webhook data available</div>
            )}
          </div>
        )}

        {/* User Activity Tab */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            {monitoringData.loading.userActivity ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            ) : monitoringData.userActivity ? (
              <>
                {/* User Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4">
                    <span className="text-sm text-blue-600 dark:text-blue-300">Total Users</span>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                      {monitoringData.userActivity.totals.totalUsers}
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-600 rounded-lg p-4">
                    <span className="text-sm text-green-600 dark:text-green-300">With VMs</span>
                    <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                      {monitoringData.userActivity.totals.usersWithVMs}
                    </div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900 border border-purple-200 dark:border-purple-600 rounded-lg p-4">
                    <span className="text-sm text-purple-600 dark:text-purple-300">Active Subscriptions</span>
                    <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                      {monitoringData.userActivity.totals.usersWithSubscriptions}
                    </div>
                  </div>
                </div>

                {/* Recent Users */}
                <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                    <h3 className="font-medium text-gray-900 dark:text-white">Recent User Activity</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-50 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Account ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">VMs</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Subscription</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Last Login</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
                        {monitoringData.userActivity.activeUsers.slice(0, 20).map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{user.username}</td>
                            <td className="px-4 py-3 text-sm font-mono text-blue-600 dark:text-blue-400">{user.accountId}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{user.vmCount}</td>
                            <td className="px-4 py-3 text-sm">
                              {user.subscription ? (
                                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 rounded-full">
                                  {user.subscription.plan}
                                </span>
                              ) : (
                                <span className="text-gray-500">None</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{user.lastLoginFormatted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">No user activity data available</div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {content}
    </div>
  );
};

export default SystemMonitoringModal; 