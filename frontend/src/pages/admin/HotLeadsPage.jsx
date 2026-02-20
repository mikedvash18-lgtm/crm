import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { hotLeadApi, brokerApi, campaignApi, leadApi } from '../../api';
import toast from 'react-hot-toast';

const statusColors = {
  activation_requested: 'bg-orange-900 text-orange-300',
  transferred:          'bg-indigo-900 text-indigo-300',
  curious:              'bg-yellow-900 text-yellow-300',
  converted:            'bg-emerald-900 text-emerald-300',
  closed:               'bg-green-900 text-green-300',
  appointment_booked:   'bg-sky-900 text-sky-300',
};

const STATUS_LABELS = { appointment_booked: 'Callback' };

const outcomeColors = {
  converted:      'bg-green-900 text-green-300',
  not_interested: 'bg-red-900 text-red-300',
  callback:       'bg-blue-900 text-blue-300',
  no_answer:      'bg-gray-700 text-gray-300',
};

export default function HotLeadsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ broker_id: '', campaign_id: '', status: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  const { data, isLoading } = useQuery(
    ['hot-leads', filters, page],
    () => hotLeadApi.list({ ...filters, page, per_page: 20 }).then(r => r.data.data),
    { refetchInterval: 30000 }
  );

  const { data: brokers } = useQuery('brokers-dropdown', () =>
    brokerApi.list({ per_page: 200 }).then(r => r.data.data?.data || [])
  );
  const { data: campaigns } = useQuery('campaigns-dropdown', () =>
    campaignApi.list({ per_page: 200 }).then(r => r.data.data?.data || [])
  );

  const stats = data?.stats;
  const leads = data?.data || [];
  const totalPages = Math.ceil((data?.total || 0) / (data?.per_page || 20));

  const depositMut = useMutation(
    (id) => leadApi.deposit(id),
    {
      onSuccess: () => { toast.success('Lead marked as deposited'); qc.invalidateQueries('hot-leads'); },
      onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
    }
  );

  const openDetail = async (id) => {
    try {
      const res = await hotLeadApi.get(id);
      setDetail(res.data.data);
    } catch { /* ignore */ }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Hot Leads</h1>
        <p className="text-gray-400 text-sm mt-1">High-value leads flagged by AI</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Total Hot Leads" value={stats.total_hot} color="text-indigo-400" />
          <StatCard label="Converted" value={stats.converted} color="text-green-400" />
          <StatCard label="Conversion Rate" value={`${stats.conversion_rate}%`} color="text-yellow-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filters.broker_id}
          onChange={e => setFilter('broker_id', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Brokers</option>
          {brokers?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select
          value={filters.campaign_id}
          onChange={e => setFilter('campaign_id', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Campaigns</option>
          {campaigns?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={e => setFilter('status', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="curious">Curious</option>
          <option value="activation_requested">Activation Requested</option>
          <option value="appointment_booked">Callback</option>
          <option value="transferred">Transferred</option>
          <option value="converted">Deposited</option>
          <option value="closed">Closed</option>
        </select>
        <input type="date" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input type="date" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-600">Loading...</div>
      ) : leads.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
          </svg>
          <p className="text-gray-500 text-lg">No hot leads yet</p>
          <p className="text-gray-600 text-sm mt-1">Hot leads will appear here when AI flags interested prospects</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {leads.map(lead => (
            <div key={lead.id}
              className="bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors overflow-hidden"
            >
              <div className="p-5 cursor-pointer" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-semibold">
                        {lead.first_name} {lead.last_name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status] || 'bg-gray-700 text-gray-300'}`}>
                        {STATUS_LABELS[lead.status] || lead.status?.replace(/_/g, ' ')}
                      </span>
                      {lead.transfer_outcome && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${outcomeColors[lead.transfer_outcome] || 'bg-gray-700 text-gray-300'}`}>
                          {lead.transfer_outcome?.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <span className="font-mono">{lead.phone}</span>
                      {lead.email && <span>{lead.email}</span>}
                      {lead.campaign_name && <span>{lead.campaign_name}</span>}
                      {lead.broker_name && <span>{lead.broker_name}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    {lead.ai_classification && (
                      <div>
                        <span className="px-2 py-1 bg-indigo-900/50 text-indigo-300 rounded-lg text-xs font-medium">
                          {lead.ai_classification}
                        </span>
                        {lead.ai_confidence && (
                          <p className="text-xs text-gray-500 mt-1">{(lead.ai_confidence * 100).toFixed(0)}% confidence</p>
                        )}
                      </div>
                    )}
                    {lead.agent_name && (
                      <div className="text-xs text-gray-500">
                        Agent: <span className="text-gray-300">{lead.agent_name}</span>
                      </div>
                    )}
                    {lead.status !== 'converted' ? (
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Mark this lead as deposited?')) depositMut.mutate(lead.id); }}
                        disabled={depositMut.isLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 shrink-0"
                      >
                        Deposit
                      </button>
                    ) : (
                      <span className="px-3 py-1.5 bg-emerald-900 text-emerald-300 text-xs font-semibold rounded-lg">
                        Deposited
                      </span>
                    )}
                    <svg className={`w-5 h-5 text-gray-600 transition-transform ${expanded === lead.id ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* AI Summary preview */}
                {lead.ai_summary && expanded !== lead.id && (
                  <p className="text-gray-500 text-sm mt-2 line-clamp-1">{lead.ai_summary}</p>
                )}
              </div>

              {/* Expanded content */}
              {expanded === lead.id && (
                <div className="px-5 pb-5 border-t border-gray-800 pt-4 space-y-4">
                  {lead.ai_summary && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">AI Summary</p>
                      <p className="text-gray-200 text-sm bg-gray-800 rounded-lg p-3">{lead.ai_summary}</p>
                    </div>
                  )}

                  {lead.transcript && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">Transcript</p>
                      <div className="text-gray-300 text-sm bg-gray-800 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">
                        {lead.transcript}
                      </div>
                    </div>
                  )}

                  {lead.agent_notes && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">Agent Notes</p>
                      <p className="text-gray-300 text-sm bg-gray-800 rounded-lg p-3">{lead.agent_notes}</p>
                    </div>
                  )}

                  {lead.status === 'appointment_booked' && lead.appointments?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">Callback Appointment</p>
                      <div className="bg-sky-900/20 border border-sky-800 rounded-lg p-3 text-sm">
                        <p className="text-sky-300 font-medium">{new Date(lead.appointments[0].appointment_date).toLocaleString()}</p>
                        {lead.appointments[0].notes && <p className="text-gray-400 mt-1">{lead.appointments[0].notes}</p>}
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          lead.appointments[0].status === 'completed' ? 'bg-green-900 text-green-300' :
                          lead.appointments[0].status === 'cancelled' ? 'bg-red-900 text-red-300' :
                          'bg-yellow-900 text-yellow-300'
                        }`}>{lead.appointments[0].status}</span>
                      </div>
                    </div>
                  )}

                  <LeadNotes leadId={lead.id} />

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    {lead.call_date && <span>Last call: {new Date(lead.call_date).toLocaleString()}</span>}
                    {lead.attempt_count > 0 && <span>Attempts: {lead.attempt_count}</span>}
                    <button
                      onClick={(e) => { e.stopPropagation(); openDetail(lead.id); }}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      View Full Detail
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700">
            Prev
          </button>
          <span className="px-3 py-1.5 text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700">
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && <DetailModal lead={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function LeadNotes({ leadId }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const { data: notes, isLoading } = useQuery(
    ['lead-notes', leadId],
    () => leadApi.getNotes(leadId).then(r => r.data.data),
    { staleTime: 10000 }
  );

  const addMut = useMutation(
    () => leadApi.addNote(leadId, note),
    {
      onSuccess: () => { setNote(''); toast.success('Note added'); qc.invalidateQueries(['lead-notes', leadId]); },
      onError: (err) => toast.error(err.response?.data?.message || 'Failed to add note'),
    }
  );

  return (
    <div onClick={e => e.stopPropagation()}>
      <p className="text-xs font-medium text-gray-400 mb-2">Notes</p>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && note.trim()) addMut.mutate(); }}
          placeholder="Add a note..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={() => addMut.mutate()}
          disabled={!note.trim() || addMut.isLoading}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>
      {isLoading ? (
        <p className="text-xs text-gray-600">Loading...</p>
      ) : notes?.length > 0 ? (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {notes.map(n => (
            <div key={n.id} className="bg-gray-800 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-indigo-400">{n.user_name}</span>
                <span className="text-xs text-gray-600">{new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm text-gray-200 mt-0.5">{n.note}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">No notes yet</p>
      )}
    </div>
  );
}

function DetailModal({ lead, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{lead.first_name} {lead.last_name}</h2>
            <p className="text-gray-400 text-sm font-mono">{lead.phone}</p>
            {lead.email && <p className="text-gray-400 text-sm">{lead.email}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Lead info */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-500">Status</p><p className="text-white capitalize">{STATUS_LABELS[lead.status] || lead.status?.replace(/_/g, ' ')}</p></div>
            <div><p className="text-gray-500">Campaign</p><p className="text-white">{lead.campaign_name || '—'}</p></div>
            <div><p className="text-gray-500">Broker</p><p className="text-white">{lead.broker_name || '—'}</p></div>
          </div>

          {/* Notes */}
          <LeadNotes leadId={lead.id} />

          {/* Call Logs */}
          {lead.call_logs?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Call Logs ({lead.call_logs.length})</h3>
              <div className="space-y-3">
                {lead.call_logs.map(cl => (
                  <div key={cl.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">{cl.event_type}</span>
                      <span className="text-xs text-gray-500">{new Date(cl.created_at).toLocaleString()}</span>
                    </div>
                    {cl.ai_classification && (
                      <p className="text-sm text-indigo-300 mb-1">Classification: {cl.ai_classification}
                        {cl.ai_confidence && ` (${(cl.ai_confidence * 100).toFixed(0)}%)`}
                      </p>
                    )}
                    {cl.ai_summary && <p className="text-sm text-gray-300 mb-2">{cl.ai_summary}</p>}
                    {cl.transcript && (
                      <div className="text-xs text-gray-400 max-h-32 overflow-y-auto whitespace-pre-wrap bg-gray-900 rounded p-2 mt-2">
                        {cl.transcript}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transfers */}
          {lead.transfers?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Transfers ({lead.transfers.length})</h3>
              <div className="space-y-2">
                {lead.transfers.map(t => (
                  <div key={t.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-300">{t.agent_name || 'Unassigned'}</span>
                      <span className="text-xs text-gray-500 ml-3">{t.status}</span>
                      {t.outcome && <span className="text-xs text-indigo-400 ml-2">{t.outcome}</span>}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(t.initiated_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Appointments */}
          {lead.appointments?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Callback Appointments ({lead.appointments.length})</h3>
              <div className="space-y-2">
                {lead.appointments.map(a => (
                  <div key={a.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between text-sm">
                    <div className="text-gray-300">
                      <span className="text-sky-300 font-medium">{new Date(a.appointment_date).toLocaleString()}</span>
                      {a.notes && <span className="text-gray-500 ml-3">{a.notes}</span>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.status === 'completed' ? 'bg-green-900 text-green-300' :
                      a.status === 'cancelled' ? 'bg-red-900 text-red-300' :
                      'bg-yellow-900 text-yellow-300'
                    }`}>{a.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attempts */}
          {lead.attempts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Call Attempts ({lead.attempts.length})</h3>
              <div className="space-y-2">
                {lead.attempts.map(a => (
                  <div key={a.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between text-sm">
                    <div className="text-gray-300">
                      Attempt #{a.attempt_number || a.id}
                      {a.ai_classification && <span className="text-indigo-400 ml-2">{a.ai_classification}</span>}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(a.started_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
