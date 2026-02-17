import { useState } from 'react';
import { useQuery } from 'react-query';
import { statsApi } from '../../api';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const PIE_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6','#14b8a6'];

export default function StatsPage() {
  const [campaignId, setCampaignId] = useState('');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery(
    ['stats', campaignId, from, to],
    () => campaignId
      ? statsApi.campaign(campaignId, { from, to }).then(r => r.data.data)
      : statsApi.dashboard().then(r => r.data.data),
    { enabled: true }
  );

  const daily   = data?.daily || [];
  const totals  = data?.totals || data?.today || {};
  const hourly  = data?.hourly || [];

  const pieData = [
    { name: 'Human',         value: +totals.human_detected    || 0 },
    { name: 'Voicemail',     value: +totals.voicemail_detected|| 0 },
    { name: 'No Answer',     value: +totals.no_answer         || 0 },
    { name: 'Transferred',   value: +totals.transferred       || 0 },
    { name: 'Converted',     value: +totals.converted         || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <div className="flex gap-3">
          <input type="number" placeholder="Campaign ID" value={campaignId} onChange={e => setCampaignId(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none" />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Calls',   value: totals.total_calls },
          { label: 'Human Rate',    value: totals.human_rate ? `${totals.human_rate}%` : '—' },
          { label: 'Transfer Rate', value: totals.transfer_rate ? `${totals.transfer_rate}%` : '—' },
          { label: 'Conversions',   value: totals.converted || totals.total_calls ? totals.converted : '—' },
          { label: 'Conv. Rate',    value: totals.conversion_rate ? `${totals.conversion_rate}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value ?? '—'}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Daily call trend */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Daily Call Volume</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily}>
              <XAxis dataKey="stat_date" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
              <Line type="monotone" dataKey="total_calls"   stroke="#6366f1" strokeWidth={2} dot={false} name="Calls" />
              <Line type="monotone" dataKey="human_detected" stroke="#22c55e" strokeWidth={2} dot={false} name="Human" />
              <Line type="monotone" dataKey="transferred"   stroke="#f59e0b" strokeWidth={2} dot={false} name="Transferred" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome breakdown */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Outcome Breakdown</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                <Legend iconType="circle" wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-600">No data available</div>
          )}
        </div>
      </div>

      {/* Hourly */}
      {hourly.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Hourly Performance (Today)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourly}>
              <XAxis dataKey="stat_hour" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={h => `${h}:00`} />
              <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} labelFormatter={h => `${h}:00`} />
              <Bar dataKey="calls" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
