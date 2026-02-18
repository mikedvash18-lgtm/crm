import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { agentApi, brokerApi } from '../../api';
import toast from 'react-hot-toast';

const statusColors = {
  offline:   'bg-gray-700 text-gray-300',
  available: 'bg-green-900 text-green-300',
  busy:      'bg-yellow-900 text-yellow-300',
  on_call:   'bg-red-900 text-red-300',
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery(['agents', search], () =>
    agentApi.list({ per_page: 100, search: search || undefined }).then(r => r.data.data)
  );

  const deleteMut = useMutation((id) => agentApi.delete(id), {
    onSuccess: () => { toast.success('Agent deleted'); qc.invalidateQueries('agents'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (agent) => { setEditing(agent); setShowModal(true); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} total agents</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Agent
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Email</th>
              <th className="text-left px-6 py-3">Broker</th>
              <th className="text-left px-6 py-3">Extension</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Languages</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">No agents found</td></tr>
            ) : data?.data?.map((a) => {
              const langs = (() => {
                try { return JSON.parse(a.language_codes || '[]'); } catch { return []; }
              })();
              return (
                <tr key={a.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{a.name}</td>
                  <td className="px-6 py-4 text-gray-300 text-xs">{a.email}</td>
                  <td className="px-6 py-4 text-gray-300">{a.broker_name || '—'}</td>
                  <td className="px-6 py-4 text-gray-300 font-mono text-xs">{a.extension || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[a.status] || statusColors.offline}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {langs.map(l => (
                        <span key={l} className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-xs">{l}</span>
                      ))}
                      {langs.length === 0 && <span className="text-gray-600 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(a)}
                        className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                        Edit
                      </button>
                      <button onClick={() => { if (confirm('Delete this agent?')) deleteMut.mutate(a.id); }}
                        className="text-xs px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-300 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <AgentModal
          agent={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('agents'); }}
        />
      )}
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function AgentModal({ agent, onClose, onSuccess }) {
  const { data: brokers } = useQuery('brokers-list', () =>
    brokerApi.list({ per_page: 100 }).then(r => r.data.data?.data || [])
  );

  const [form, setForm] = useState({
    name:           agent?.name || '',
    email:          agent?.email || '',
    password:       '',
    broker_id:      agent?.broker_id || '',
    extension:      agent?.extension || '',
    language_codes: (() => {
      try { return JSON.parse(agent?.language_codes || '[]').join(', '); } catch { return ''; }
    })(),
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        email: form.email,
        broker_id: parseInt(form.broker_id),
        extension: form.extension || null,
        language_codes: form.language_codes
          ? form.language_codes.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      };
      if (form.password) payload.password = form.password;

      if (agent) {
        await agentApi.update(agent.id, payload);
        toast.success('Agent updated');
      } else {
        if (!form.password) { toast.error('Password is required'); setLoading(false); return; }
        payload.password = form.password;
        await agentApi.create(payload);
        toast.success('Agent created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-bold text-white mb-4">{agent ? 'Edit Agent' : 'New Agent'}</h2>

        <div className="space-y-4">
          <Field label="Name">
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </Field>
          <Field label="Email">
            <input className={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
          </Field>
          <Field label={agent ? 'Password (leave blank to keep)' : 'Password'}>
            <input className={input} type="password" value={form.password} onChange={e => set('password', e.target.value)}
              required={!agent} placeholder={agent ? 'Leave blank to keep current' : ''} />
          </Field>
          <Field label="Broker">
            <select className={input} value={form.broker_id} onChange={e => set('broker_id', e.target.value)} required>
              <option value="">Select broker...</option>
              {brokers?.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Extension">
            <input className={input} value={form.extension} onChange={e => set('extension', e.target.value)}
              placeholder="e.g. 1001" />
          </Field>
          <Field label="Languages (comma-separated)">
            <input className={input} value={form.language_codes} onChange={e => set('language_codes', e.target.value)}
              placeholder="en, es, de" />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Saving...' : agent ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
