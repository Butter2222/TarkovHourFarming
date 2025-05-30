import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  CreditCard, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Loader2,
  AlertTriangle,
  PieChart,
  Target,
  Zap,
  Clock,
  BarChart3,
  User
} from 'lucide-react';

const Analytics = () => {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [error, setError] = useState('');

  const fetchAuditLogs = useCallback(async (page = 1, filters = {}) => {
    try {
      setAuditLogsLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: auditPagination.limit.toString(),
        ...filters
      });

      const response = await fetch(`/api/admin/audit-logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data.logs);
        setAuditPagination(prev => ({ ...prev, total: data.total, page }));
      } else {
        setError('Failed to fetch audit logs');
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      setError('Network error fetching audit logs.');
    } finally {
      setAuditLogsLoading(false);
    }
  }, [auditPagination.limit]);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAnalytics();
      fetchAuditLogs();
    }
  }, [user, fetchAuditLogs]);

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/analytics', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.analytics);
      } else {
        setError('Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError('Network error fetching analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-500">Access denied. Admin privileges required.</p>
      </div>
    );
  }

  if (analyticsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }

  if (!analytics) return null;

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(num || 0);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">Analytics Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Comprehensive insights into user activity and system performance</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg transition-colors duration-200">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
                {analytics.statusDistribution?.reduce((sum, item) => sum + item.count, 0) || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg transition-colors duration-200">
              <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">New Users (30d)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
                {analytics.userGrowth?.reduce((sum, day) => sum + day.new_users, 0) || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg transition-colors duration-200">
              <CreditCard className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">Active Subscriptions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
                {analytics.subscriptionAnalytics?.reduce((sum, sub) => sum + sub.active_count, 0) || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg transition-colors duration-200">
              <Zap className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors duration-200">Recent Activity</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white transition-colors duration-200">
                {analytics.recentActivity?.reduce((sum, activity) => sum + activity.count, 0) || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
            <TrendingUp className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            User Registration Trends (30 days)
          </h3>
          {analytics.userGrowth && analytics.userGrowth.length > 0 ? (
            <div className="space-y-3">
              {analytics.userGrowth.slice(-10).map((day, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-20 text-sm text-gray-600 dark:text-gray-400">{formatDate(day.date)}</div>
                  <div className="flex-1 mx-3">
                    <div className="bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div 
                        className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full"
                        style={{ 
                          width: `${Math.max(10, (day.new_users / Math.max(...analytics.userGrowth.map(d => d.new_users))) * 100)}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-8 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{day.new_users}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 transition-colors duration-200">No user registration data available</p>
          )}
        </div>

        {/* Status Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
            <PieChart className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
            User Status Distribution
          </h3>
          {analytics.statusDistribution && analytics.statusDistribution.length > 0 ? (
            <div className="space-y-3">
              {analytics.statusDistribution.map((status, index) => {
                const colors = {
                  active: 'bg-green-600 dark:bg-green-500',
                  suspended: 'bg-yellow-600 dark:bg-yellow-500',
                  banned: 'bg-red-600 dark:bg-red-500'
                };
                const total = analytics.statusDistribution.reduce((sum, item) => sum + item.count, 0);
                const percentage = ((status.count / total) * 100).toFixed(1);
                
                return (
                  <div key={index} className="flex items-center">
                    <div className="flex items-center w-24">
                      <div className={`w-3 h-3 rounded-full mr-2 ${colors[status.status] || 'bg-gray-600 dark:bg-gray-500'}`}></div>
                      <span className="text-sm text-gray-600 dark:text-gray-400 capitalize transition-colors duration-200">{status.status}</span>
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${colors[status.status] || 'bg-gray-600 dark:bg-gray-500'}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="w-16 text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{status.count} ({percentage}%)</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8 transition-colors duration-200">No status data available</p>
          )}
        </div>
      </div>

      {/* Subscription Analytics */}
      {analytics.subscriptionAnalytics && analytics.subscriptionAnalytics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
            <CreditCard className="h-5 w-5 mr-2 text-purple-600 dark:text-purple-400" />
            Subscription Analytics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {analytics.subscriptionAnalytics.map((sub, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors duration-200">
                <h4 className="font-medium text-gray-900 dark:text-white transition-colors duration-200">{sub.subscription_plan}</h4>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Total:</span>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors duration-200">{sub.count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Active:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{sub.active_count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Expired:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{sub.count - sub.active_count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Active Users */}
      {analytics.topUsers && analytics.topUsers.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
            <Target className="h-5 w-5 mr-2 text-indigo-600 dark:text-indigo-400" />
            Most Active Users (30 days)
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
              <thead className="bg-gray-50 dark:bg-gray-700 transition-colors duration-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Activity Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Last Login</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600 transition-colors duration-200">
                {analytics.topUsers.map((user, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-8 w-8 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center transition-colors duration-200">
                          <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white transition-colors duration-200">{user.username}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300' 
                          : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300'
                      } transition-colors duration-200`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white transition-colors duration-200">
                      {formatNumber(user.activity_count)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                      {user.last_login ? formatDate(user.last_login) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent System Activity */}
      {analytics.recentActivity && analytics.recentActivity.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
            <Zap className="h-5 w-5 mr-2 text-yellow-600 dark:text-yellow-400" />
            Recent System Activity (7 days)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analytics.recentActivity.map((activity, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white transition-colors duration-200 capitalize">
                  {activity.action.replace(/_/g, ' ')}
                </h4>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Type:</span>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors duration-200">{activity.resource_type || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Count:</span>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors duration-200">{activity.count}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 transition-colors duration-200">Last:</span>
                    <span className="font-medium text-gray-900 dark:text-white transition-colors duration-200">{formatDate(activity.last_occurrence)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audit Logs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-200">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center transition-colors duration-200">
          <Clock className="h-5 w-5 mr-2 text-gray-600 dark:text-gray-400" />
          System Audit Logs
        </h3>
        
        {auditLogsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading audit logs...</span>
          </div>
        ) : auditLogs && auditLogs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead className="bg-gray-50 dark:bg-gray-700 transition-colors duration-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">Resource</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-200">IP Address</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600 transition-colors duration-200">
                  {auditLogs.map((log, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white transition-colors duration-200">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white transition-colors duration-200">
                        {log.username || 'System'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white transition-colors duration-200">
                        <span className="capitalize">{log.action.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                        {log.resource_type} {log.resource_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">
                        {log.ip_address || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {auditPagination && auditPagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-gray-600 pt-4 transition-colors duration-200">
                <div className="text-sm text-gray-700 dark:text-gray-300 transition-colors duration-200">
                  Showing {((auditPagination.currentPage - 1) * auditPagination.limit) + 1} to{' '}
                  {Math.min(auditPagination.currentPage * auditPagination.limit, auditPagination.totalCount)} of{' '}
                  {auditPagination.totalCount} results
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => fetchAuditLogs(auditPagination.currentPage - 1)}
                    disabled={auditPagination.currentPage <= 1}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300 transition-colors duration-200">
                    Page {auditPagination.currentPage} of {auditPagination.totalPages}
                  </span>
                  <button
                    onClick={() => fetchAuditLogs(auditPagination.currentPage + 1)}
                    disabled={auditPagination.currentPage >= auditPagination.totalPages}
                    className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8 transition-colors duration-200">No audit logs available</p>
        )}
      </div>
    </div>
  );
};

export default Analytics; 