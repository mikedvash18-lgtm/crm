import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { brokerRouteApi, brokerApi, countryApi, voximplantAccountApi } from '../../api';
import toast from 'react-hot-toast';

export default function BrokerRoutesPage() {
  const { id: brokerId } = useParams();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: broker } = useQuery(['broker', brokerId], () =>
    brokerApi.get(brokerId).then(r => r.data.data)
  );

  const { data: routes, isLoading } = useQuery(['broker-routes', brokerId], () =>
    brokerRouteApi.list(brokerId).then(r => r.data.data)
  );

  const deleteMut = useMutation((routeId) => brokerRouteApi.delete(brokerId, routeId), {
    onSuccess: () => { toast.success('Route deleted'); qc.invalidateQueries(['broker-routes', brokerId]); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (route) => { setEditing(route); setShowModal(true); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to="/brokers" className="text-gray-400 hover:text-white text-sm transition-colors">
              Brokers
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-gray-300 text-sm">{broker?.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Voximplant Routes</h1>
          <p className="text-gray-400 text-sm mt-1">Configure Voximplant routing per country</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Route
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Country</th>
              <th className="text-left px-6 py-3">Voximplant Account</th>
              <th className="text-left px-6 py-3">Rule Name</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : !routes?.length ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">No routes configured</td></tr>
            ) : routes.map((r) => (
              <tr key={r.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 text-white font-medium">{r.country_name}</td>
                <td className="px-6 py-4 text-gray-300 text-xs">{r.voximplant_account_name || '—'}</td>
                <td className="px-6 py-4 text-gray-300 font-mono text-xs">{r.voximplant_rule_name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    +r.is_active ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {+r.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(r)}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this route?')) deleteMut.mutate(r.id); }}
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
        <RouteModal
          brokerId={brokerId}
          route={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries(['broker-routes', brokerId]); }}
        />
      )}
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function RouteModal({ brokerId, route, onClose, onSuccess }) {
  const { data: countries } = useQuery('countries', () =>
    countryApi.list().then(r => r.data.data)
  );
  const { data: voxAccounts } = useQuery('voximplant-accounts', () =>
    voximplantAccountApi.list().then(r => r.data.data)
  );

  const [form, setForm] = useState({
    country_id: route?.country_id || '',
    voximplant_account_id: route?.voximplant_account_id || '',
    voximplant_rule_name: route?.voximplant_rule_name || '',
    is_active: route ? +route.is_active : 1,
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (route) {
        await brokerRouteApi.update(brokerId, route.id, form);
        toast.success('Route updated');
      } else {
        await brokerRouteApi.create(brokerId, form);
        toast.success('Route created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving route');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-bold text-white mb-4">{route ? 'Edit Route' : 'New Route'}</h2>

        <div className="space-y-4">
          <Field label="Country">
            <select className={input} value={form.country_id} onChange={e => set('country_id', e.target.value)}
              required disabled={!!route}>
              <option value="">Select country...</option>
              {countries?.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Voximplant Account">
            <select className={input} value={form.voximplant_account_id}
              onChange={e => set('voximplant_account_id', e.target.value)} required>
              <option value="">Select account...</option>
              {voxAccounts?.filter(a => +a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Rule Name">
            <input className={input} value={form.voximplant_rule_name}
              onChange={e => set('voximplant_rule_name', e.target.value)} required
              placeholder="Voximplant rule name" />
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
            {loading ? 'Saving...' : route ? 'Update' : 'Create'}
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
