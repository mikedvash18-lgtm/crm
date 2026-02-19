import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { leadApi } from '../../api';

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
  failed:               'bg-red-900 text-red-300',
  no_answer:            'bg-orange-900 text-orange-300',
  pending:              'bg-gray-700 text-gray-300',
  appointment_booked:   'bg-sky-900 text-sky-300',
};

const STATUS_LABELS = { appointment_booked: 'Callback' };

export default function LeadDetail() {
  const { id } = useParams();

  const { data: lead, isLoading } = useQuery(['lead', id], () =>
    leadApi.get(id).then(r => r.data.data)
  );

  const { data: attempts } = useQuery(['lead-attempts', id], () =>
    leadApi.attempts(id).then(r => r.data.data || [])
  );

  if (isLoading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!lead) return <div className="p-8 text-red-400">Lead not found</div>;

  return (
    <div className="p-8 max-w-4xl">
      <Link to="/leads" className="text-indigo-400 hover:text-indigo-300 text-sm mb-4 inline-block">&larr; Back to Leads</Link>

      {/* Lead info header */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {lead.first_name} {lead.last_name}
            </h1>
            <p className="text-gray-400 text-sm mt-1 font-mono">{lead.phone}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusColors[lead.status]}`}>
            {STATUS_LABELS[lead.status] || lead.status?.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            ['Email', lead.email || '—'],
            ['Campaign', lead.campaign_name || `#${lead.campaign_id}`],
            ['Country', lead.country_name || '—'],
            ['Attempts', lead.attempt_count],
            ['Score', lead.score ?? '—'],
            ['Next Script', lead.next_script_version || '—'],
            ['Next Retry', lead.next_retry_at ? new Date(lead.next_retry_at).toLocaleString() : '—'],
            ['Source', lead.source || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm text-white mt-0.5">{String(val)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Attempt History */}
      <h2 className="text-lg font-semibold text-white mb-4">Attempt History</h2>
      {(!attempts || attempts.length === 0) ? (
        <p className="text-gray-500 text-sm">No attempts recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {attempts.map((att) => (
            <AttemptCard key={att.id} attempt={att} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttemptCard({ attempt }) {
  const [expanded, setExpanded] = useState(false);
  const att = attempt;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm font-bold text-white">
            {att.attempt_number || '#'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[att.outcome] || 'bg-gray-700 text-gray-300'}`}>
                {att.outcome?.replace(/_/g, ' ') || 'pending'}
              </span>
              {att.ai_classification && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-900 text-indigo-300">
                  AI: {att.ai_classification}
                </span>
              )}
              {att.script_version && (
                <span className="text-xs text-gray-500">Script {att.script_version}</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {att.started_at ? new Date(att.started_at).toLocaleString() : '—'}
              {att.duration_seconds ? ` · ${att.duration_seconds}s` : ''}
              {att.ai_confidence ? ` · Confidence: ${(att.ai_confidence * 100).toFixed(1)}%` : ''}
            </p>
          </div>
        </div>
        <svg className={`w-5 h-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
          {att.ai_summary && (
            <div>
              <p className="text-xs text-gray-500 mb-1">AI Summary</p>
              <p className="text-sm text-gray-300">{att.ai_summary}</p>
            </div>
          )}
          {att.transcript && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Transcript</p>
              <pre className="text-xs text-gray-400 bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto whitespace-pre-wrap">{att.transcript}</pre>
            </div>
          )}
          {!att.ai_summary && !att.transcript && (
            <p className="text-xs text-gray-600">No transcript or AI data available for this attempt.</p>
          )}
        </div>
      )}
    </div>
  );
}
