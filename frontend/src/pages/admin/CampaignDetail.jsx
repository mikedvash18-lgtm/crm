import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { campaignApi, statsApi, leadApi, scriptApi, detectorApi } from '../../api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

export default function CampaignDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [showTestCall, setShowTestCall] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const { data: camp, isLoading } = useQuery(['campaign', id], () =>
    campaignApi.get(id).then(r => r.data.data)
  );
  const { data: stats } = useQuery(['campaign-stats', id], () =>
    statsApi.campaign(id).then(r => r.data.data)
  );

  const startMut  = useMutation(() => campaignApi.start(id),  { onSuccess: () => { toast.success('Campaign started');  qc.invalidateQueries(['campaign', id]); }});
  const pauseMut  = useMutation(() => campaignApi.pause(id),  { onSuccess: () => { toast.success('Campaign paused');   qc.invalidateQueries(['campaign', id]); }});
  const resumeMut = useMutation(() => campaignApi.resume(id), { onSuccess: () => { toast.success('Campaign resumed');  qc.invalidateQueries(['campaign', id]); }});
  const testCallMut = useMutation((leadId) => campaignApi.testCall(id, leadId ? { lead_id: leadId } : undefined), {
    onSuccess: (r) => {
      const d = r.data.data;
      toast.success(`Test call to ${d.name || d.phone} initiated`);
      setShowTestCall(false);
      qc.invalidateQueries(['activity-log', id]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Test call failed'),
  });
  const { data: campaignLeads } = useQuery(['campaign-leads', id], () =>
    leadApi.list({ campaign_id: id, per_page: 200 }).then(r => r.data.data?.data || []),
    { enabled: showTestCall }
  );

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
          {!['completed','archived'].includes(camp.status) && <Btn onClick={() => setShowEdit(true)} label="Edit Campaign" color="indigo" />}
          {camp.status === 'draft'  && <Btn onClick={() => startMut.mutate()}  label="Start"  color="green" />}
          {camp.status === 'active' && <Btn onClick={() => pauseMut.mutate()}  label="Pause"  color="yellow" />}
          {camp.status === 'active' && <Btn onClick={() => setShowTestCall(true)} label="Test Call" color="indigo" />}
          {camp.status === 'paused' && <Btn onClick={() => resumeMut.mutate()} label="Resume" color="green" />}
          <StatusBadge status={camp.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {[['overview','Overview'], ['leads','Leads'], ['activity','Activity Log']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Config grid */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {[
              ['Max Attempts',      camp.max_attempts],
              ['Retry Interval',    `${camp.retry_interval_minutes}m`],
              ['Concurrency',       camp.concurrency_limit],
              ['Call Window',       `${camp.call_window_start?.slice(0,5)} – ${camp.call_window_end?.slice(0,5)}`],
              ['Lead Limit',        camp.lead_limit || 'No limit'],
              ['Pool Source',       camp.pool_source_filter || 'All'],
              ['Pool Date Range',   camp.pool_date_from || camp.pool_date_to ? `${camp.pool_date_from || '...'} – ${camp.pool_date_to || '...'}` : 'All'],
            ].filter(([, v]) => v).map(([label, val]) => (
              <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-lg font-bold text-white mt-1">{val}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Calls',    val: t.total_calls,        color: 'text-white' },
              { label: 'Human Detected',  val: t.human_detected,     color: 'text-green-400' },
              { label: 'No Answer',       val: t.no_answer,          color: 'text-red-400' },
              { label: 'Voicemail',       val: t.voicemail_detected, color: 'text-orange-400' },
              { label: 'Not Interested',  val: t.not_interested,     color: 'text-gray-400' },
              { label: 'Hot Leads',       val: (+( t.curious || 0) + +(t.activation_requested || 0)), color: 'text-amber-400', sub: `${t.curious ?? 0} curious + ${t.activation_requested ?? 0} activation` },
              { label: 'Transferred',     val: t.transferred,        color: 'text-cyan-400' },
              { label: 'Converted',       val: t.converted,          color: 'text-emerald-400' },
            ].map(({ label, val, color, sub }) => (
              <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <p className="text-xs text-gray-400">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{val ?? 0}</p>
                {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
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
        </>
      )}

      {tab === 'leads' && <CampaignLeads campaignId={id} isActive={camp.status === 'active'} />}

      {tab === 'activity' && <ActivityLog campaignId={id} isActive={camp.status === 'active'} />}

      {/* Edit Campaign Modal */}
      {showEdit && (
        <EditCampaignModal
          campaign={camp}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); qc.invalidateQueries(['campaign', id]); }}
        />
      )}

      {/* Test Call Modal */}
      {showTestCall && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md max-h-[70vh] flex flex-col">
            <h2 className="text-lg font-bold text-white mb-4">Test Call</h2>
            <p className="text-gray-400 text-sm mb-4">Pick a lead to call, or use the first queued lead.</p>
            <button onClick={() => testCallMut.mutate(null)}
              className="w-full mb-3 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
              Call Next Queued Lead
            </button>
            <div className="overflow-y-auto flex-1 space-y-1">
              {campaignLeads?.map(lead => (
                <div key={lead.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
                  <div>
                    <span className="text-white text-sm">{lead.first_name} {lead.last_name}</span>
                    <span className="text-gray-500 text-xs ml-2 font-mono">{lead.phone}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                      lead.status === 'queued' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                    }`}>{lead.status}</span>
                  </div>
                  <button onClick={() => testCallMut.mutate(lead.id)}
                    className="text-xs px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                    Call
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTestCall(false)}
              className="mt-4 w-full px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edit Campaign Modal ───────────────────────────────────
const TIMEZONES = ['UTC','America/New_York','America/Los_Angeles','Europe/London','Europe/Berlin','Europe/Madrid','Asia/Tokyo'];

function EditCampaignModal({ campaign, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:                   campaign.name || '',
    caller_id:              campaign.caller_id || '',
    detector_id:            campaign.detector_id || '',
    script_a_id:            campaign.script_a_id || '',
    script_b_id:            campaign.script_b_id || '',
    script_c_id:            campaign.script_c_id || '',
    concurrency_limit:      campaign.concurrency_limit || 10,
    max_attempts:           campaign.max_attempts || 3,
    retry_interval_minutes: campaign.retry_interval_minutes || 60,
    call_window_start:      campaign.call_window_start?.slice(0, 5) || '09:00',
    call_window_end:        campaign.call_window_end?.slice(0, 5) || '20:00',
    call_window_timezone:   campaign.call_window_timezone || 'UTC',
  });
  const [saving, setSaving] = useState(false);

  const { data: scripts } = useQuery('scripts-list', () =>
    scriptApi.list({ per_page: 100 }).then(r => r.data.data?.data || [])
  );
  const { data: detectors } = useQuery('detectors-list', () =>
    detectorApi.list({ per_page: 100 }).then(r => r.data.data?.data || [])
  );

  const scriptsA = scripts?.filter(s => s.version === 'A') || [];
  const scriptsB = scripts?.filter(s => s.version === 'B') || [];
  const scriptsC = scripts?.filter(s => s.version === 'C') || [];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Campaign name is required'); return; }
    setSaving(true);
    try {
      await campaignApi.update(campaign.id, form);
      toast.success('Campaign updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-5">Edit Campaign</h2>

        <div className="space-y-4">
          {/* Name & Caller ID */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Campaign Name</label>
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Caller ID</label>
            <input className={input} value={form.caller_id} onChange={e => set('caller_id', e.target.value)} placeholder="+12025551234" />
          </div>

          {/* Detector & Scripts */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">Detector & Scripts</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Detector (Stage 1)</label>
                <select className={input} value={form.detector_id} onChange={e => set('detector_id', e.target.value)}>
                  <option value="">None (use built-in default)</option>
                  {detectors?.map(d => <option key={d.id} value={d.id}>{d.name} ({d.language_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Script A (1st attempt)</label>
                <select className={input} value={form.script_a_id} onChange={e => set('script_a_id', e.target.value)}>
                  <option value="">Select script A...</option>
                  {scriptsA.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Script B (2nd attempt)</label>
                <select className={input} value={form.script_b_id} onChange={e => set('script_b_id', e.target.value)}>
                  <option value="">None (optional)</option>
                  {scriptsB.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Script C (3rd attempt)</label>
                <select className={input} value={form.script_c_id} onChange={e => set('script_c_id', e.target.value)}>
                  <option value="">None (optional)</option>
                  {scriptsC.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Call Settings */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">Call Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Concurrency</label>
                <input type="number" min="1" className={input} value={form.concurrency_limit} onChange={e => set('concurrency_limit', +e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Max Attempts</label>
                <input type="number" min="1" max="10" className={input} value={form.max_attempts} onChange={e => set('max_attempts', +e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-400 mb-1">Retry Interval (min)</label>
              <input type="number" min="1" className={input} value={form.retry_interval_minutes} onChange={e => set('retry_interval_minutes', +e.target.value)} />
            </div>
          </div>

          {/* Call Window */}
          <div className="border-t border-gray-800 pt-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">Call Window</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Start</label>
                <input type="time" className={input} value={form.call_window_start} onChange={e => set('call_window_start', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">End</label>
                <input type="time" className={input} value={form.call_window_end} onChange={e => set('call_window_end', e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-400 mb-1">Timezone</label>
              <select className={input} value={form.call_window_timezone} onChange={e => set('call_window_timezone', e.target.value)}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-800">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Leads ───────────────────────────────────────
const LEAD_STATUSES = [
  '', 'new', 'queued', 'called', 'human', 'voicemail', 'not_interested',
  'curious', 'activation_requested', 'transferred', 'closed', 'archived',
  'do_not_call', 'wrong_number', 'no_engagement',
];

const LEAD_STATUS_COLORS = {
  new: 'bg-gray-700 text-gray-300',
  queued: 'bg-blue-900 text-blue-300',
  called: 'bg-indigo-900 text-indigo-300',
  human: 'bg-green-900 text-green-300',
  voicemail: 'bg-orange-900 text-orange-300',
  not_interested: 'bg-gray-700 text-gray-400',
  curious: 'bg-amber-900 text-amber-300',
  activation_requested: 'bg-yellow-900 text-yellow-300',
  transferred: 'bg-cyan-900 text-cyan-300',
  closed: 'bg-emerald-900 text-emerald-300',
  archived: 'bg-gray-800 text-gray-500',
  do_not_call: 'bg-red-900 text-red-300',
  wrong_number: 'bg-red-900 text-red-400',
  no_engagement: 'bg-gray-700 text-gray-400',
};

function CampaignLeads({ campaignId, isActive }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);

  const { data, isLoading } = useQuery(
    ['campaign-leads-detail', campaignId, search, status, page],
    () => leadApi.campaignLeads(campaignId, {
      search: search || undefined,
      status: status || undefined,
      page,
      per_page: 30,
    }).then(r => r.data.data),
    { refetchInterval: isActive ? 15000 : false, keepPreviousData: true }
  );

  useEffect(() => setPage(1), [search, status]);

  const rows = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 30);

  // Count by status
  const statusSummary = useMemo(() => {
    const counts = {};
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search name or phone..."
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={status}
          onChange={e => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.filter(Boolean).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500 ml-auto">{total} leads{isActive ? ' (auto-refreshing)' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">AI Classification</th>
              <th className="text-left px-4 py-3">Attempts</th>
              <th className="text-left px-4 py-3">Duration</th>
              <th className="text-left px-4 py-3">Last Called</th>
              <th className="text-left px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !rows.length ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-600 text-sm">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-600 text-sm">No leads found</td></tr>
            ) : rows.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                isExpanded={expanded === lead.id}
                onToggle={() => setExpanded(expanded === lead.id ? null : lead.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Prev</button>
          <span className="px-3 py-1 text-gray-400 text-sm">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Next</button>
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, isExpanded, onToggle }) {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  const classification = lead.ai_classification?.replace(/_/g, ' ') || '—';
  const duration = lead.last_duration ? `${Math.floor(lead.last_duration / 60)}:${String(lead.last_duration % 60).padStart(2, '0')}` : '—';
  const lastCall = lead.last_call_at ? new Date(lead.last_call_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <>
      <tr className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 text-white font-medium">{name}</td>
        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{lead.phone}</td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEAD_STATUS_COLORS[lead.status] || 'bg-gray-700 text-gray-300'}`}>
            {lead.status?.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-4 py-3">
          {lead.ai_classification ? (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              lead.ai_classification === 'activation_requested' ? 'bg-yellow-900 text-yellow-300' :
              lead.ai_classification === 'curious' ? 'bg-amber-900 text-amber-300' :
              lead.ai_classification === 'not_interested' ? 'bg-gray-700 text-gray-400' :
              'bg-purple-900 text-purple-300'
            }`}>
              {classification}
            </span>
          ) : <span className="text-gray-600 text-xs">—</span>}
          {lead.ai_confidence > 0 && (
            <span className="text-gray-600 text-xs ml-1">{Math.round(lead.ai_confidence * 100)}%</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-300 text-center">{lead.attempt_count || 0}</td>
        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{duration}</td>
        <td className="px-4 py-3 text-gray-400 text-xs">{lastCall}</td>
        <td className="px-4 py-3 text-gray-500">
          <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-t border-gray-800/50">
          <td colSpan={8} className="px-4 py-4 bg-gray-800/20">
            <LeadDetail lead={lead} />
          </td>
        </tr>
      )}
    </>
  );
}

function LeadDetail({ lead }) {
  const { data: attempts, isLoading } = useQuery(
    ['lead-attempts', lead.id],
    () => leadApi.attempts(lead.id).then(r => r.data.data),
    { staleTime: 30000 }
  );

  return (
    <div className="space-y-4">
      {/* AI Summary */}
      {lead.ai_summary && (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <p className="text-xs font-semibold text-gray-400 mb-1">AI Summary</p>
          <p className="text-sm text-gray-200">{lead.ai_summary}</p>
        </div>
      )}

      {/* Transcript */}
      {lead.transcript && (
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <p className="text-xs font-semibold text-gray-400 mb-1">Transcript</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto font-sans leading-relaxed">{lead.transcript}</pre>
        </div>
      )}

      {/* Lead info */}
      <div className="flex gap-4 text-xs text-gray-400">
        {lead.email && <span>Email: <span className="text-gray-300">{lead.email}</span></span>}
        <span>Script: <span className="text-gray-300">{lead.last_script_version || lead.next_script_version || '—'}</span></span>
        {lead.next_retry_at && <span>Next retry: <span className="text-gray-300">{new Date(lead.next_retry_at).toLocaleString()}</span></span>}
      </div>

      {/* Attempt history */}
      {isLoading ? (
        <p className="text-xs text-gray-600">Loading attempts...</p>
      ) : attempts?.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">Attempt History</p>
          <div className="space-y-2">
            {attempts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 bg-gray-900 rounded-lg px-3 py-2 border border-gray-700/50">
                <span className="text-xs font-bold text-gray-500 w-6">#{a.attempt_number}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  a.outcome === 'human' ? 'bg-green-900 text-green-300' :
                  a.outcome === 'voicemail' ? 'bg-orange-900 text-orange-300' :
                  a.outcome === 'no_answer' ? 'bg-red-900 text-red-300' :
                  a.outcome === 'pending' ? 'bg-blue-900 text-blue-300' :
                  'bg-gray-700 text-gray-400'
                }`}>{a.outcome || 'pending'}</span>
                <span className="text-xs text-gray-500">Script {a.script_version}</span>
                {a.duration_seconds > 0 && (
                  <span className="text-xs text-gray-500 font-mono">{Math.floor(a.duration_seconds / 60)}:{String(a.duration_seconds % 60).padStart(2, '0')}</span>
                )}
                {a.ai_classification && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300">{a.ai_classification.replace(/_/g, ' ')}</span>
                )}
                <span className="text-xs text-gray-600 ml-auto">
                  {a.started_at ? new Date(a.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Activity Log ──────────────────────────────────────────
const EVENT_COLORS = {
  campaign_started:    'bg-green-900 text-green-300',
  campaign_paused:     'bg-yellow-900 text-yellow-300',
  campaign_resumed:    'bg-green-900 text-green-300',
  leads_claimed:       'bg-blue-900 text-blue-300',
  call_initiated:      'bg-indigo-900 text-indigo-300',
  human_detected:      'bg-emerald-900 text-emerald-300',
  voicemail_detected:  'bg-orange-900 text-orange-300',
  no_answer:           'bg-red-900 text-red-300',
  ai_classified:       'bg-purple-900 text-purple-300',
  call_completed:      'bg-gray-700 text-gray-300',
  transfer_initiated:  'bg-cyan-900 text-cyan-300',
  transfer_completed:  'bg-teal-900 text-teal-300',
  retry_scheduled:     'bg-amber-900 text-amber-300',
  retry_queued:        'bg-amber-900 text-amber-300',
  crm_sync:            'bg-sky-900 text-sky-300',
  error:               'bg-red-900 text-red-300',
};

const EVENT_TYPES = [
  '', 'campaign_started', 'campaign_paused', 'campaign_resumed', 'leads_claimed',
  'call_initiated', 'human_detected', 'voicemail_detected', 'no_answer',
  'ai_classified', 'call_completed', 'transfer_initiated', 'transfer_completed',
  'retry_scheduled', 'retry_queued', 'crm_sync', 'error',
];

function ActivityLog({ campaignId, isActive }) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery(
    ['activity-log', campaignId, filter, page],
    () => campaignApi.activityLog(campaignId, { event_type: filter || undefined, page, per_page: 50 }).then(r => r.data.data),
    { refetchInterval: isActive ? 10000 : false }
  );

  // Reset page when filter changes
  useEffect(() => setPage(1), [filter]);

  const rows = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="">All events</option>
          {EVENT_TYPES.filter(Boolean).map(et => (
            <option key={et} value={et}>{et.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <span className="text-xs text-gray-500">{total} events{isActive ? ' (auto-refreshing)' : ''}</span>
      </div>

      {/* Timeline */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 divide-y divide-gray-800 max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-gray-600 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">No activity yet</div>
        ) : rows.map(row => (
          <div key={row.id} className="flex items-start gap-3 px-4 py-3">
            <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_COLORS[row.event_type] || 'bg-gray-700 text-gray-300'}`}>
              {row.event_type.replace(/_/g, ' ')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200">{row.message}</p>
              {(row.lead_name?.trim() || row.lead_phone) && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {row.lead_name?.trim() && <span>{row.lead_name}</span>}
                  {row.lead_phone && <span className="font-mono ml-1">{row.lead_phone}</span>}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xs text-gray-600 whitespace-nowrap">
              {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              <br />
              <span className="text-gray-700">{new Date(row.created_at).toLocaleDateString()}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Prev</button>
          <span className="px-3 py-1 text-gray-400 text-sm">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Next</button>
        </div>
      )}
    </div>
  );
}

function Btn({ onClick, label, color }) {
  const c = { green: 'bg-green-600 hover:bg-green-700', yellow: 'bg-yellow-600 hover:bg-yellow-700', indigo: 'bg-indigo-600 hover:bg-indigo-700' };
  return <button onClick={onClick} className={`${c[color]} text-white text-sm px-4 py-2 rounded-lg font-semibold transition-colors`}>{label}</button>;
}

function StatusBadge({ status }) {
  const m = { draft:'bg-gray-700 text-gray-300', active:'bg-green-900 text-green-300', paused:'bg-yellow-900 text-yellow-300' };
  return <span className={`px-3 py-2 rounded-lg text-sm font-medium ${m[status] || 'bg-gray-800 text-gray-400'}`}>{status}</span>;
}
