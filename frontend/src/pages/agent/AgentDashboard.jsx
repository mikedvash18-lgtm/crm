import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { transferApi } from '../../api';
import toast from 'react-hot-toast';

export default function AgentDashboard() {
  const [status, setStatus]       = useState('available');
  const [activeTransfer, setActiveTransfer] = useState(null);
  const [outcome, setOutcome]     = useState('');
  const [notes, setNotes]         = useState('');
  const qc = useQueryClient();

  // Poll for incoming transfers
  const { data: pending } = useQuery('pending-transfers', () =>
    transferApi.pending().then(r => r.data.data),
    { refetchInterval: 3000 }
  );

  // Alert on new transfer
  useEffect(() => {
    if (pending?.length > 0 && !activeTransfer) {
      toast.custom((t) => (
        <div className={`bg-gray-800 border border-indigo-500 rounded-xl p-4 flex items-center gap-3 shadow-xl ${t.visible ? 'animate-enter' : 'animate-leave'}`}>
          <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Incoming Transfer</p>
            <p className="text-gray-400 text-xs">{pending[0].first_name} {pending[0].last_name}</p>
          </div>
        </div>
      ), { duration: 5000 });
    }
  }, [pending]);

  const acceptMut = useMutation((id) => transferApi.accept(id), {
    onSuccess: (_, id) => {
      const t = pending.find(t => t.id === id);
      if (t) setActiveTransfer(t);
      setStatus('on_call');
      qc.invalidateQueries('pending-transfers');
    }
  });

  const rejectMut = useMutation((id) => transferApi.reject(id), {
    onSuccess: () => qc.invalidateQueries('pending-transfers')
  });

  const completeMut = useMutation(({ id, outcome, notes }) => transferApi.complete(id, { outcome, notes }), {
    onSuccess: () => {
      toast.success('Call completed');
      setActiveTransfer(null);
      setOutcome('');
      setNotes('');
      setStatus('available');
      qc.invalidateQueries('pending-transfers');
    }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Status header */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Agent Panel</h1>
          <p className="text-gray-400 text-sm mt-1">Manage incoming transfers</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Status:</span>
          <div className="flex gap-2">
            {['available', 'busy'].map((s) => (
              <button key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  status === s
                    ? s === 'available' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s === 'available' ? '🟢 Available' : '🟡 Busy'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Active call */}
      {activeTransfer && (
        <div className="bg-gray-900 border-2 border-indigo-500 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-indigo-400 uppercase tracking-wide">Active Call</span>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-lg font-bold text-white">{activeTransfer.first_name} {activeTransfer.last_name}</h3>
              <p className="text-gray-400 font-mono text-sm mt-1">{activeTransfer.phone}</p>
              {activeTransfer.email && <p className="text-gray-400 text-sm mt-0.5">{activeTransfer.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">AI Classification</p>
              <span className="px-3 py-1 bg-indigo-900 text-indigo-300 rounded-full text-sm font-medium">
                {activeTransfer.ai_classification || 'Pending…'}
              </span>
            </div>
          </div>

          {activeTransfer.ai_summary && (
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-400 mb-1 font-medium">AI Summary</p>
              <p className="text-gray-200 text-sm">{activeTransfer.ai_summary}</p>
            </div>
          )}

          {activeTransfer.transcript && (
            <div className="bg-gray-800 rounded-lg p-4 mb-4 max-h-40 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-1 font-medium">Transcript</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{activeTransfer.transcript}</p>
            </div>
          )}

          <div className="border-t border-gray-800 pt-4">
            <p className="text-sm font-medium text-gray-300 mb-3">Close Call Outcome</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {['converted', 'not_interested', 'callback', 'no_answer'].map((o) => (
                <button key={o} onClick={() => setOutcome(o)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    outcome === o ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}>
                  {o.replace(/_/g,' ')}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about the call…"
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
            />
            <button
              onClick={() => completeMut.mutate({ id: activeTransfer.id, outcome, notes })}
              disabled={!outcome}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              Complete Call
            </button>
          </div>
        </div>
      )}

      {/* Pending transfers */}
      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">
          Incoming Transfers {pending?.length > 0 && <span className="ml-1 bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">{pending.length}</span>}
        </h2>
        {!pending?.length ? (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center text-gray-600">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            No pending transfers
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((t) => (
              <div key={t.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{t.first_name} {t.last_name}</p>
                  <p className="text-gray-400 text-sm font-mono">{t.phone}</p>
                  {t.email && <p className="text-gray-500 text-xs">{t.email}</p>}
                  {t.ai_classification && (
                    <span className="text-xs text-indigo-400 mt-1 block">AI: {t.ai_classification}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rejectMut.mutate(t.id)}
                    className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-red-300 rounded-lg text-sm transition-colors">
                    Reject
                  </button>
                  <button onClick={() => acceptMut.mutate(t.id)}
                    className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
