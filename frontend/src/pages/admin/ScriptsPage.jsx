import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { scriptApi, detectorApi } from '../../api';
import toast from 'react-hot-toast';

const versionColors = {
  A: 'bg-indigo-900 text-indigo-300',
  B: 'bg-purple-900 text-purple-300',
  C: 'bg-teal-900 text-teal-300',
};

export default function ScriptsPage() {
  const [activeTab, setActiveTab] = useState('scripts');

  return (
    <div className="p-8">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800">
        {[
          { key: 'scripts', label: 'Scripts' },
          { key: 'detectors', label: 'Detectors' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'scripts' && <ScriptsTab />}
      {activeTab === 'detectors' && <DetectorsTab />}
    </div>
  );
}

// ─── Scripts Tab ──────────────────────────────────────────────
function ScriptsTab() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [versionFilter, setVersionFilter] = useState('');

  const { data, isLoading } = useQuery(['scripts', versionFilter], () =>
    scriptApi.list({ version: versionFilter || undefined, per_page: 100 }).then(r => r.data.data)
  );

  const deleteMut = useMutation((id) => scriptApi.delete(id), {
    onSuccess: () => { toast.success('Script deleted'); qc.invalidateQueries('scripts'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (script) => { setEditing(script); setShowModal(true); };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Scripts</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} total scripts</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Script
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {['', 'A', 'B', 'C'].map((v) => (
          <button key={v} onClick={() => setVersionFilter(v)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              versionFilter === v ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}>
            {v || 'All'}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Version</th>
              <th className="text-left px-6 py-3">Language</th>
              <th className="text-left px-6 py-3">Created By</th>
              <th className="text-left px-6 py-3">Content Preview</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-600">No scripts found</td></tr>
            ) : data?.data?.map((s) => (
              <tr key={s.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 text-white font-medium">{s.name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${versionColors[s.version] || 'bg-gray-700 text-gray-300'}`}>
                    {s.version}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300">{s.language_code}</td>
                <td className="px-6 py-4 text-gray-400">{s.created_by_name || '\u2014'}</td>
                <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-[250px]">{s.content}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(s)}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this script?')) deleteMut.mutate(s.id); }}
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
        <ScriptModal
          script={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('scripts'); }}
        />
      )}
    </>
  );
}

// ─── Detectors Tab ────────────────────────────────────────────
function DetectorsTab() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data, isLoading } = useQuery('detectors', () =>
    detectorApi.list({ per_page: 100 }).then(r => r.data.data)
  );

  const deleteMut = useMutation((id) => detectorApi.delete(id), {
    onSuccess: () => { toast.success('Detector deleted'); qc.invalidateQueries('detectors'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Delete failed'),
  });

  const openNew = () => { setEditing(null); setShowModal(true); };
  const openEdit = (detector) => { setEditing(detector); setShowModal(true); };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Detectors</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total ?? 0} total detectors</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          + New Detector
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Language</th>
              <th className="text-left px-6 py-3">Created By</th>
              <th className="text-left px-6 py-3">Content Preview</th>
              <th className="text-left px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : data?.data?.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">No detectors found</td></tr>
            ) : data?.data?.map((d) => (
              <tr key={d.id} className="border-t border-gray-800 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 text-white font-medium">{d.name}</td>
                <td className="px-6 py-4 text-gray-300">{d.language_code}</td>
                <td className="px-6 py-4 text-gray-400">{d.created_by_name || '\u2014'}</td>
                <td className="px-6 py-4 text-gray-500 text-xs truncate max-w-[350px]">{d.content}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(d)}
                      className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                      Edit
                    </button>
                    <button onClick={() => { if (confirm('Delete this detector?')) deleteMut.mutate(d.id); }}
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
        <DetectorModal
          detector={editing}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); qc.invalidateQueries('detectors'); }}
        />
      )}
    </>
  );
}

// ─── Script Modal ─────────────────────────────────────────────
const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function ScriptModal({ script, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: script?.name || '',
    version: script?.version || 'A',
    language_code: script?.language_code || 'en',
    content: script?.content || '',
    ai_prompt: script?.ai_prompt || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (script) {
        await scriptApi.update(script.id, form);
        toast.success('Script updated');
      } else {
        await scriptApi.create(form);
        toast.success('Script created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving script');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-4">{script ? 'Edit Script' : 'New Script'}</h2>

        <div className="space-y-4">
          <Field label="Name">
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Version">
              <select className={input} value={form.version} onChange={e => set('version', e.target.value)}>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </Field>
            <Field label="Language">
              <select className={input} value={form.language_code} onChange={e => set('language_code', e.target.value)}>
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
                <option value="nl">Dutch</option>
                <option value="sv">Swedish</option>
              </select>
            </Field>
          </div>

          <Field label="Script Content">
            <textarea className={`${input} h-40 resize-y`} value={form.content}
              onChange={e => set('content', e.target.value)} required
              placeholder="The script text that will be read during the call..." />
          </Field>

          <Field label="AI Prompt (optional)">
            <textarea className={`${input} h-28 resize-y`} value={form.ai_prompt}
              onChange={e => set('ai_prompt', e.target.value)}
              placeholder="Instructions for the AI on how to handle this script..." />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Saving...' : script ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Detector Modal ───────────────────────────────────────────
function DetectorModal({ detector, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: detector?.name || '',
    language_code: detector?.language_code || 'en',
    content: detector?.content || '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (detector) {
        await detectorApi.update(detector.id, form);
        toast.success('Detector updated');
      } else {
        await detectorApi.create(form);
        toast.success('Detector created');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving detector');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white mb-4">{detector ? 'Edit Detector' : 'New Detector'}</h2>

        <div className="space-y-4">
          <Field label="Name">
            <input className={input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </Field>

          <Field label="Language">
            <select className={input} value={form.language_code} onChange={e => set('language_code', e.target.value)}>
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="es">Spanish</option>
              <option value="it">Italian</option>
              <option value="nl">Dutch</option>
              <option value="sv">Swedish</option>
            </select>
          </Field>

          <Field label="Detector Prompt">
            <p className="text-xs text-gray-500 mb-1">Prompt used in Stage 1 to detect human vs voicemail. The detector should stay silent and listen, then call transfer_connected or voicemail_detected.</p>
            <textarea className={`${input} h-40 resize-y`} value={form.content}
              onChange={e => set('content', e.target.value)} required
              placeholder="You are a call connection detector. Your ONLY job is to determine if a real human answered or if it went to voicemail..." />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Saving...' : detector ? 'Update' : 'Create'}
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
