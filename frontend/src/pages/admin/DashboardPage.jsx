import { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import { statsApi } from '../../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-600/20 text-indigo-400',
    green:  'bg-green-600/20 text-green-400',
    yellow: 'bg-yellow-600/20 text-yellow-400',
    red:    'bg-red-600/20 text-red-400',
  };
  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
      {sub && <p className={`text-xs mt-1 font-medium ${colors[color]}`}>{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery('dashboard', () => statsApi.dashboard().then(r => r.data.data), {
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-800 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const today    = data?.today || {};
  const agents   = data?.agents || [];
  const activity = data?.recent_activity || [];

  const agentMap = agents.reduce((acc, a) => ({ ...acc, [a.status]: a.cnt }), {});

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Real-time campaign overview</p>
        </div>
        <span className="text-xs text-gray-500">{new Date().toLocaleString()}</span>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Campaigns" value={data?.active_campaigns} color="indigo" />
        <StatCard label="Calls Today"      value={today.total_calls}    color="green" />
        <StatCard
          label="Transfers Today"
          value={today.transferred}
          sub={today.total_calls ? `${Math.round(today.transferred/today.total_calls*100)}% of calls` : null}
          color="yellow"
        />
        <StatCard label="Converted Today"  value={today.converted}      color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Agent Status */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Agent Status</h2>
          <div className="space-y-3">
            {[
              { key: 'available', label: 'Available', color: 'bg-green-500' },
              { key: 'on_call',   label: 'On Call',   color: 'bg-yellow-500' },
              { key: 'busy',      label: 'Busy',      color: 'bg-orange-500' },
              { key: 'offline',   label: 'Offline',   color: 'bg-gray-600' },
            ].map(({ key, label, color }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-sm text-gray-300">{label}</span>
                </div>
                <span className="text-sm font-bold text-white">{agentMap[key] || 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="xl:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Recent Activity</h2>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">Lead</th>
                  <th className="text-left pb-2">Campaign</th>
                  <th className="text-left pb-2">Status</th>
                  <th className="text-left pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="py-2 text-white">{row.first_name} {row.last_name}</td>
                    <td className="py-2 text-gray-400 truncate max-w-[120px]">{row.campaign}</td>
                    <td className="py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2 text-gray-500 text-xs">
                      {new Date(row.updated_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {activity.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-600">No recent activity</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    new:                  'bg-gray-700 text-gray-300',
    queued:               'bg-blue-900 text-blue-300',
    called:               'bg-blue-900 text-blue-300',
    human:                'bg-green-900 text-green-300',
    voicemail:            'bg-yellow-900 text-yellow-300',
    not_interested:       'bg-red-900 text-red-300',
    curious:              'bg-purple-900 text-purple-300',
    activation_requested: 'bg-indigo-900 text-indigo-300',
    transferred:          'bg-teal-900 text-teal-300',
    closed:               'bg-green-900 text-green-300',
    archived:             'bg-gray-700 text-gray-400',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-800 text-gray-400'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}
