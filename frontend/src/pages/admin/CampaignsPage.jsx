import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Link } from 'react-router-dom';
import { campaignApi } from '../../api';
import toast from 'react-hot-toast';

const statusColors = {
  draft:     'bg-gray-700 text-gray-300',
  active:    'bg-green-900 text-green-300',
  paused:    'bg-yellow-900 text-yellow-300',
  completed: 'bg-blue-900 text-blue-300',
  archived:  'bg-gray-800 text-gray-500',
};

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery(['campaigns', statusFilter], () =>
    campaignApi.list({ status: statusFilter || undefined }).then(r => r.data.data)
  );

  const startMut  = useMutation((id) => campaignApi.start(id),  { onSuccess: () => { toast.success('Campaign started');  qc.invalidateQueries('campaigns'); }});
  const pauseMut  = useMutation((id) => campaignApi.pause(id),  { onSuccess: () => { toast.success('Campaign paused');   qc.invalidateQueries('campaigns'); }});
  const resumeMut = useMutation((id) => campaignApi.resume(id), { onSuccess: () => { toast.success('Campaign resumed');  qc.invalidateQueries('campaigns'); }});

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} total campaigns</p>
        </div>
        <Link to="/campaigns/new"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Campaign
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['', 'active', 'paused', 'draft', 'completed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Broker</th>
              <th className="text-left px-6 py-3">Country</th>
              <th className="text-left px-6 py-3">Leads</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-600">Loading…</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-600">No campaigns found</td></tr>
            ) : data?.data?.map((c) => (
              <tr key={c.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <Link to={`/campaigns/${c.id}`} className="text-white hover:text-indigo-400 font-medium">{c.name}</Link>
                </td>
                <td className="px-6 py-4 text-gray-300">{c.broker_name}</td>
                <td className="px-6 py-4 text-gray-300">{c.country_name}</td>
                <td className="px-6 py-4 text-gray-300">{c.total_leads?.toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    {c.status === 'draft'  && <ActionBtn onClick={() => startMut.mutate(c.id)}  label="Start"  color="green" />}
                    {c.status === 'active' && <ActionBtn onClick={() => pauseMut.mutate(c.id)}  label="Pause"  color="yellow" />}
                    {c.status === 'paused' && <ActionBtn onClick={() => resumeMut.mutate(c.id)} label="Resume" color="green" />}
                    <Link to={`/campaigns/${c.id}`}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, label, color }) {
  const colors = { green: 'bg-green-900 hover:bg-green-800 text-green-300', yellow: 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300' };
  return (
    <button onClick={onClick} className={`text-xs px-3 py-1 rounded transition-colors ${colors[color]}`}>
      {label}
    </button>
  );
}
