import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { campaignApi, statsApi } from '../../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

export default function CampaignDetail() {
  const { id } = useParams();
  const qc = useQueryClient();

  const { data: camp, isLoading } = useQuery(['campaign', id], () =>
    campaignApi.get(id).then(r => r.data.data)
  );
  const { data: stats } = useQuery(['campaign-stats', id], () =>
    statsApi.campaign(id).then(r => r.data.data)
  );

  const startMut  = useMutation(() => campaignApi.start(id),  { onSuccess: () => { toast.success('Campaign started');  qc.invalidateQueries(['campaign', id]); }});
  const pauseMut  = useMutation(() => campaignApi.pause(id),  { onSuccess: () => { toast.success('Campaign paused');   qc.invalidateQueries(['campaign', id]); }});
  const resumeMut = useMutation(() => campaignApi.resume(id), { onSuccess: () => { toast.success('Campaign resumed');  qc.invalidateQueries(['campaign', id]); }});

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!camp) return <div className="p-8 text-red-400">Campaign not found</div>;

  const t = stats?.totals || {};

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{camp.name}</h1>
          <p className="text-gray-400 text-sm mt-1">{camp.broker_name} · {camp.country_name}</p>
        </div>
        <div className="flex gap-2">
          {camp.status === 'draft'  && <Btn onClick={() => startMut.mutate()}  label="Start"  color="green" />}
          {camp.status === 'active' && <Btn onClick={() => pauseMut.mutate()}  label="Pause"  color="yellow" />}
          {camp.status === 'paused' && <Btn onClick={() => resumeMut.mutate()} label="Resume" color="green" />}
          <StatusBadge status={camp.status} />
        </div>
      </div>

      {/* Config grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {[
          ['Max Attempts',      camp.max_attempts],
          ['Retry Interval',    `${camp.retry_interval_minutes}m`],
          ['Concurrency',       camp.concurrency_limit],
          ['Call Window',       `${camp.call_window_start?.slice(0,5)} – ${camp.call_window_end?.slice(0,5)}`],
        ].map(([label, val]) => (
          <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-lg font-bold text-white mt-1">{val}</p>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Calls',   val: t.total_calls },
          { label: 'Human Detected',val: t.human_detected },
          { label: 'Voicemail',     val: t.voicemail_detected },
          { label: 'Transferred',   val: t.transferred },
          { label: 'Converted',     val: t.converted },
        ].map(({ label, val }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-white">{val ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {stats?.daily?.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Call Trend</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.daily}>
              <XAxis dataKey="stat_date" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
              <Line type="monotone" dataKey="total_calls"    stroke="#6366f1" strokeWidth={2} dot={false} name="Calls" />
              <Line type="monotone" dataKey="human_detected" stroke="#22c55e" strokeWidth={2} dot={false} name="Human" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, label, color }) {
  const c = { green: 'bg-green-600 hover:bg-green-700', yellow: 'bg-yellow-600 hover:bg-yellow-700' };
  return <button onClick={onClick} className={`${c[color]} text-white text-sm px-4 py-2 rounded-lg font-semibold transition-colors`}>{label}</button>;
}

function StatusBadge({ status }) {
  const m = { draft:'bg-gray-700 text-gray-300', active:'bg-green-900 text-green-300', paused:'bg-yellow-900 text-yellow-300' };
  return <span className={`px-3 py-2 rounded-lg text-sm font-medium ${m[status] || 'bg-gray-800 text-gray-400'}`}>{status}</span>;
}
