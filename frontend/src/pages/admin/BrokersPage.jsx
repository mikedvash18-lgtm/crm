import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { brokerApi } from '../../api';
import toast from 'react-hot-toast';

export default function BrokersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery('brokers', () =>
    brokerApi.list({ per_page: 100 }).then(r => r.data.data)
  );

  const deleteMut = useMutation((id) => brokerApi.delete(id), {
    onSuccess: () => { toast.success('Broker deleted'); qc.invalidateQueries('brokers'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const navigate = useNavigate();
  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (broker) => { setEditing(broker); setShowModal(true); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Brokers</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} total brokers</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Broker
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Code</th>
              <th className="text-left px-6 py-3">Campaigns</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Loading…</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">No brokers found</td></tr>
            ) : data?.data?.map((b) => (
              <tr key={b.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 text-white font-medium">{b.name}</td>
                <td className="px-6 py-4 text-gray-300 font-mono text-xs">{b.code}</td>
                <td className="px-6 py-4 text-gray-300">{b.campaign_count}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    +b.is_active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {+b.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/brokers/${b.id}/routes`)}
                      className="text-xs px-3 py-1 rounded bg-indigo-900 hover:bg-indigo-800 text-indigo-300 transition-colors">
                      Routes
                    </button>
                    <button onClick={() => openEdit(b)}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this broker?')) deleteMut.mutate(b.id); }}
                      className="text-xs px-3 py-1 rounded bg-red-900 hover:bg-red-800 text-red-300 transition-colors">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <BrokerModal
          broker={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('brokers'); }}
        />
      )}
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function BrokerModal({ broker, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: broker?.name || '',
    code: broker?.code || '',
    is_active: broker ? +broker.is_active : 1,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (broker) {
        await brokerApi.update(broker.id, form);
        toast.success('Broker updated');
      } else {
        await brokerApi.create(form);
        toast.success('Broker created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving broker');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-bold text-white mb-4">{broker ? 'Edit Broker' : 'New Broker'}</h2>

        <div className="space-y-4">
          <Field label="Name">
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </Field>
          <Field label="Code (unique identifier)">
            <input className={input} value={form.code} onChange={e => set('code', e.target.value)} required
              disabled={!!broker} placeholder="e.g. broker_xyz" />
          </Field>
          <Field label="Status">
            <select className={input} value={form.is_active} onChange={e => set('is_active', +e.target.value)}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Saving…' : broker ? 'Update' : 'Create'}
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
