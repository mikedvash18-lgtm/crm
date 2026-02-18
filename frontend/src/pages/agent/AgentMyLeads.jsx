import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { transferApi, leadApi } from '../../api';
import toast from 'react-hot-toast';

const statusColors = {
  new:                   'bg-gray-700 text-gray-300',
  queued:                'bg-blue-900 text-blue-300',
  called:                'bg-cyan-900 text-cyan-300',
  human:                 'bg-green-900 text-green-300',
  voicemail:             'bg-yellow-900 text-yellow-300',
  not_interested:        'bg-red-900 text-red-300',
  curious:               'bg-yellow-900 text-yellow-300',
  activation_requested:  'bg-orange-900 text-orange-300',
  transferred:           'bg-indigo-900 text-indigo-300',
  closed:                'bg-green-900 text-green-300',
  archived:              'bg-gray-700 text-gray-400',
};

export default function AgentMyLeads() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  const { data, isLoading } = useQuery(
    ['my-leads', search, statusFilter, page],
    () => transferApi.myLeads({
      search: search || undefined,
      status: statusFilter || undefined,
      page,
      per_page: 50,
    }).then(r => r.data.data),
    { keepPreviousData: true }
  );

  const leads = data?.data || [];
  const totalPages = Math.ceil((data?.total || 0) / (data?.per_page || 50));

  const openDetail = async (id) => {
    try {
      const res = await transferApi.leadDetail(id);
      setDetail(res.data.data);
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">My Leads</h1>
        <p className="text-gray-400 text-sm mt-1">Leads assigned to your broker</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search name or phone..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          {Object.keys(statusColors).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-5 py-3">Name</th>
              <th className="text-left px-5 py-3">Phone</th>
              <th className="text-left px-5 py-3">Campaign</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">AI Classification</th>
              <th className="text-left px-5 py-3">Attempts</th>
              <th className="text-left px-5 py-3">Last Called</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">No leads found</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id}
                className="border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors"
                onClick={() => expanded === lead.id ? setExpanded(null) : setExpanded(lead.id)}
              >
                <td className="px-5 py-3 text-white font-medium">{lead.first_name} {lead.last_name}</td>
                <td className="px-5 py-3 text-gray-300 font-mono text-xs">{lead.phone}</td>
                <td className="px-5 py-3 text-gray-300">{lead.campaign_name || '—'}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status] || 'bg-gray-700 text-gray-300'}`}>
                    {lead.status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {lead.ai_classification ? (
                    <span className="text-indigo-400 text-xs">{lead.ai_classification}</span>
                  ) : <span className="text-gray-600 text-xs">—</span>}
                </td>
                <td className="px-5 py-3 text-gray-400">{lead.attempt_count || 0}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {lead.last_call_date ? new Date(lead.last_call_date).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Expanded detail row */}
        {expanded && leads.find(l => l.id === expanded) && (() => {
          const lead = leads.find(l => l.id === expanded);
          return (
            <div className="border-t border-gray-800 bg-gray-800/20 p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  {lead.ai_summary && (
                    <div>
                      <p className="text-xs font-medium text-gray-400 mb-1">AI Summary</p>
                      <p className="text-gray-200 text-sm">{lead.ai_summary}</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openDetail(lead.id); }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors ml-4"
                >
                  Full Detail
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700">
            Prev
          </button>
          <span className="px-3 py-1.5 text-gray-400 text-sm">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-700">
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {detail && <LeadDetailModal lead={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function LeadDetailModal({ lead, onClose }) {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState('');

  const { data: notes, isLoading: notesLoading } = useQuery(
    ['lead-notes', lead.id],
    () => leadApi.getNotes(lead.id).then(r => r.data.data),
    { staleTime: 10000 }
  );

  const addNoteMut = useMutation(
    () => leadApi.addNote(lead.id, newNote),
    {
      onSuccess: () => { setNewNote(''); toast.success('Note added'); qc.invalidateQueries(['lead-notes', lead.id]); },
      onError: (err) => toast.error(err.response?.data?.message || 'Failed to add note'),
    }
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{lead.first_name} {lead.last_name}</h2>
            <p className="text-gray-400 text-sm font-mono">{lead.phone}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div><p className="text-gray-500">Status</p><p className="text-white capitalize">{lead.status?.replace(/_/g, ' ')}</p></div>
            <div><p className="text-gray-500">Campaign</p><p className="text-white">{lead.campaign_name || '—'}</p></div>
            <div><p className="text-gray-500">Broker</p><p className="text-white">{lead.broker_name || '—'}</p></div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Notes</h3>
            <div className="flex gap-2 mb-3">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a note about this lead..."
                rows={2}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <button
                onClick={() => addNoteMut.mutate()}
                disabled={!newNote.trim() || addNoteMut.isLoading}
                className="self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
              >
                {addNoteMut.isLoading ? 'Saving...' : 'Add'}
              </button>
            </div>
            {notesLoading ? (
              <p className="text-xs text-gray-600">Loading notes...</p>
            ) : notes?.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {notes.map(n => (
                  <div key={n.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-indigo-400">{n.user_name}</span>
                      <span className="text-xs text-gray-500">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{n.note}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No notes yet</p>
            )}
          </div>

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
                      <p className="text-sm text-indigo-300 mb-1">
                        Classification: {cl.ai_classification}
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
