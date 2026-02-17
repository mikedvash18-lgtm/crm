import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { voximplantAccountApi } from '../../api';
import toast from 'react-hot-toast';

export default function VoximplantAccountsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: accounts, isLoading } = useQuery('voximplant-accounts', () =>
    voximplantAccountApi.list().then(r => r.data.data)
  );

  const deleteMut = useMutation((id) => voximplantAccountApi.delete(id), {
    onSuccess: () => { toast.success('Account deleted'); qc.invalidateQueries('voximplant-accounts'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (account) => { setEditing(account); setShowModal(true); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Voximplant Accounts</h1>
          <p className="text-gray-400 text-sm mt-1">Manage shared Voximplant credentials</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Account
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Account ID</th>
              <th className="text-left px-6 py-3">API Key</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : !accounts?.length ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">No accounts configured</td></tr>
            ) : accounts.map((a) => (
              <tr key={a.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 text-white font-medium">{a.name}</td>
                <td className="px-6 py-4 text-gray-300 font-mono text-xs">{a.account_id}</td>
                <td className="px-6 py-4 text-gray-400 font-mono text-xs">{'*'.repeat(8)}...{a.api_key?.slice(-4)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    +a.is_active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {+a.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(a)}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this account?')) deleteMut.mutate(a.id); }}
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
        <AccountModal
          account={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('voximplant-accounts'); }}
        />
      )}
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function AccountModal({ account, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: account?.name || '',
    account_id: account?.account_id || '',
    api_key: account?.api_key || '',
    is_active: account ? +account.is_active : 1,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (account) {
        await voximplantAccountApi.update(account.id, form);
        toast.success('Account updated');
      } else {
        await voximplantAccountApi.create(form);
        toast.success('Account created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-bold text-white mb-4">{account ? 'Edit Account' : 'New Voximplant Account'}</h2>

        <div className="space-y-4">
          <Field label="Name (label for this account)">
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)}
              required placeholder="e.g. Main Production Account" />
          </Field>
          <Field label="Account ID">
            <input className={input} value={form.account_id} onChange={e => set('account_id', e.target.value)}
              required placeholder="Voximplant Account ID" />
          </Field>
          <Field label="API Key">
            <input className={input} value={form.api_key} onChange={e => set('api_key', e.target.value)}
              required placeholder="Voximplant API Key" />
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
            {loading ? 'Saving...' : account ? 'Update' : 'Create'}
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
