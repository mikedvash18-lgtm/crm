import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { leadApi } from '../../api';
import toast from 'react-hot-toast';

const statusColors = {
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
};

export default function LeadsPage() {
  const [filters, setFilters] = useState({ status: '', phone: '', campaign_id: '' });
  const [page, setPage]       = useState(1);
  const [uploadModal, setUploadModal] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery(['leads', filters, page], () =>
    leadApi.list({ ...filters, page, per_page: 50 }).then(r => r.data.data)
  );

  const retryMut = useMutation((id) => leadApi.retry(id), {
    onSuccess: () => { toast.success('Lead queued for retry'); qc.invalidateQueries('leads'); }
  });

  const f = (k, v) => { setFilters(prev => ({ ...prev, [k]: v })); setPage(1); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total?.toLocaleString() ?? 0} total leads</p>
        </div>
        <button onClick={() => setUploadModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          Upload CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
          placeholder="Search phone…"
          value={filters.phone}
          onChange={e => f('phone', e.target.value)}
        />
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.status}
          onChange={e => f('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {['new','queued','called','human','voicemail','not_interested','curious','activation_requested','transferred','closed'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>
        <input
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none w-36"
          placeholder="Campaign ID"
          type="number"
          value={filters.campaign_id}
          onChange={e => f('campaign_id', e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Phone</th>
              <th className="text-left px-6 py-3">Campaign</th>
              <th className="text-left px-6 py-3">Attempts</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Next Retry</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading…</td></tr>
            ) : data?.data?.map((lead) => (
              <tr key={lead.id} className="border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer" onClick={() => navigate(`/leads/${lead.id}`)}>
                <td className="px-6 py-3 text-white">{lead.first_name} {lead.last_name}</td>
                <td className="px-6 py-3 text-gray-300 font-mono text-xs">{lead.phone}</td>
                <td className="px-6 py-3 text-gray-400 truncate max-w-[120px]">{lead.campaign_name}</td>
                <td className="px-6 py-3 text-gray-400">{lead.attempt_count}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                    {lead.status?.replace(/_/g,' ')}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-500 text-xs">
                  {lead.next_retry_at ? new Date(lead.next_retry_at).toLocaleString() : '—'}
                </td>
                <td className="px-6 py-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); retryMut.mutate(lead.id); }}
                    className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">
            Prev
          </button>
          <span className="px-3 py-1 text-gray-400 text-sm">
            Page {page} of {Math.ceil(data.total / 50)}
          </span>
          <button disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">
            Next
          </button>
        </div>
      )}

      {uploadModal && <UploadModal onClose={() => setUploadModal(false)} onSuccess={() => { setUploadModal(false); qc.invalidateQueries('leads'); }} />}
    </div>
  );
}

function UploadModal({ onClose, onSuccess }) {
  const [campaignId, setCampaignId] = useState('');
  const [file, setFile]   = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handleUpload = async () => {
    if (!file || !campaignId) return toast.error('Select a file and enter campaign ID');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('campaign_id', campaignId);
    setLoading(true);
    try {
      const { data } = await leadApi.upload(fd);
      toast.success(`Uploaded: ${data.data.inserted} leads (${data.data.duplicates} duplicates skipped)`);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-white mb-4">Upload Leads CSV</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Campaign ID</label>
            <input className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              type="number" value={campaignId} onChange={e => setCampaignId(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">CSV File</label>
            <div
              className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 transition-colors"
              onClick={() => fileRef.current.click()}
            >
              <p className="text-gray-400 text-sm">{file ? file.name : 'Click to select CSV or Excel file'}</p>
              <p className="text-gray-600 text-xs mt-1">Expected columns: phone, first_name, last_name, email</p>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files[0])} />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">Cancel</button>
          <button onClick={handleUpload} disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
