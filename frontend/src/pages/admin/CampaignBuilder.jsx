import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { campaignApi, brokerApi, scriptApi, countryApi, leadPoolApi } from '../../api';
import toast from 'react-hot-toast';

const STEPS = ['Basics', 'Lead Pool', 'Scripts', 'Retry Logic', 'Call Window', 'Review'];

export default function CampaignBuilder() {
  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [poolCount, setPoolCount] = useState(null);
  const navigate            = useNavigate();

  const [form, setForm] = useState({
    name: '', broker_id: '', country_id: '',
    pool_source_filter: '', pool_date_from: '', pool_date_to: '', lead_limit: '',
    script_a_id: '', script_b_id: '', script_c_id: '',
    max_attempts: 3, retry_interval_minutes: 60,
    concurrency_limit: 10,
    call_window_start: '09:00', call_window_end: '20:00',
    call_window_timezone: 'UTC', caller_id: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: brokers } = useQuery('brokers-list', () =>
    brokerApi.list({ is_active: 1, per_page: 100 }).then(r => r.data.data?.data || [])
  );
  const { data: countries } = useQuery('countries-list', () =>
    countryApi.list().then(r => r.data.data || [])
  );
  const { data: scripts } = useQuery('scripts-list', () =>
    scriptApi.list({ per_page: 100 }).then(r => r.data.data?.data || [])
  );
  const { data: sources } = useQuery('pool-sources', () =>
    leadPoolApi.sources().then(r => r.data.data || [])
  );

  // Live preview count when pool filters change
  useEffect(() => {
    if (!form.country_id) { setPoolCount(null); return; }
    const params = { country_id: form.country_id };
    if (form.pool_source_filter) params.source = form.pool_source_filter;
    if (form.pool_date_from) params.date_from = form.pool_date_from;
    if (form.pool_date_to) params.date_to = form.pool_date_to;
    leadPoolApi.preview(params).then(r => setPoolCount(r.data.data?.count ?? 0)).catch(() => setPoolCount(null));
  }, [form.country_id, form.pool_source_filter, form.pool_date_from, form.pool_date_to]);

  const scriptsA = scripts?.filter(s => s.version === 'A') || [];
  const scriptsB = scripts?.filter(s => s.version === 'B') || [];
  const scriptsC = scripts?.filter(s => s.version === 'C') || [];

  const brokerName = brokers?.find(b => +b.id === +form.broker_id)?.name;
  const countryName = countries?.find(c => +c.id === +form.country_id)?.name;
  const scriptAName = scripts?.find(s => +s.id === +form.script_a_id)?.name;
  const scriptBName = scripts?.find(s => +s.id === +form.script_b_id)?.name;
  const scriptCName = scripts?.find(s => +s.id === +form.script_c_id)?.name;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data } = await campaignApi.create(form);
      toast.success('Campaign created!');
      navigate(`/campaigns/${data.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error creating campaign');
    } finally {
      setLoading(false);
    }
  };

  const reviewRows = [
    ['Campaign Name', form.name],
    ['Broker', brokerName || form.broker_id],
    ['Country', countryName || form.country_id],
    ['Caller ID', form.caller_id],
    ['Pool Source', form.pool_source_filter || 'All sources'],
    ['Pool Date Range', form.pool_date_from || form.pool_date_to ? `${form.pool_date_from || '...'} to ${form.pool_date_to || '...'}` : 'All dates'],
    ['Lead Limit', form.lead_limit || 'No limit'],
    ['Pool Leads Available', poolCount != null ? poolCount : '—'],
    ['Script A', scriptAName || form.script_a_id || '—'],
    ['Script B', scriptBName || form.script_b_id || '—'],
    ['Script C', scriptCName || form.script_c_id || '—'],
    ['Max Attempts', form.max_attempts],
    ['Retry Interval', `${form.retry_interval_minutes} min`],
    ['Concurrency', form.concurrency_limit],
    ['Call Window', `${form.call_window_start} – ${form.call_window_end}`],
    ['Timezone', form.call_window_timezone],
  ].filter(([, v]) => v);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">New Campaign</h1>
      <p className="text-gray-400 text-sm mb-8">Configure and launch your AI calling campaign</p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
              i < step ? 'bg-indigo-600 text-white' : i === step ? 'bg-indigo-500 text-white' : 'bg-gray-800 text-gray-500'
            }`}>{i < step ? '\u2713' : i + 1}</div>
            <span className={`text-xs hidden sm:block ${i === step ? 'text-white' : 'text-gray-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px w-4 ${i < step ? 'bg-indigo-600' : 'bg-gray-700'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Campaign Basics</h2>
            <Field label="Campaign Name">
              <input className={input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. EU Lead Gen Q1" />
            </Field>
            <Field label="Broker">
              <select className={input} value={form.broker_id} onChange={e => set('broker_id', e.target.value)}>
                <option value="">Select a broker...</option>
                {brokers?.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </Field>
            <Field label="Country">
              <select className={input} value={form.country_id} onChange={e => set('country_id', e.target.value)}>
                <option value="">Select a country...</option>
                {countries?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone_prefix})</option>)}
              </select>
            </Field>
            <Field label="Caller ID (phone number)">
              <input className={input} value={form.caller_id} onChange={e => set('caller_id', e.target.value)} placeholder="+12025551234" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Lead Pool</h2>
            <p className="text-gray-400 text-sm mb-2">When the campaign starts, leads matching these filters will be claimed from the central pool.</p>
            <Field label="Source Filter">
              <select className={input} value={form.pool_source_filter} onChange={e => set('pool_source_filter', e.target.value)}>
                <option value="">All sources</option>
                {sources?.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Uploaded From">
                <input className={input} type="date" value={form.pool_date_from} onChange={e => set('pool_date_from', e.target.value)} />
              </Field>
              <Field label="Uploaded To">
                <input className={input} type="date" value={form.pool_date_to} onChange={e => set('pool_date_to', e.target.value)} />
              </Field>
            </div>
            <Field label="Lead Limit (leave empty for all)">
              <input className={input} type="number" min={1} value={form.lead_limit} onChange={e => set('lead_limit', e.target.value)} placeholder="No limit" />
            </Field>
            {form.country_id ? (
              <div className="bg-gray-800 rounded-lg p-4 mt-2">
                <p className="text-sm text-gray-300">
                  <span className="text-2xl font-bold text-indigo-400">{poolCount != null ? poolCount.toLocaleString() : '...'}</span>
                  <span className="ml-2">leads available in pool</span>
                  {form.lead_limit && poolCount != null && (
                    <span className="ml-2 text-indigo-300">
                      — will claim {Math.min(Number(form.lead_limit), poolCount).toLocaleString()} of {poolCount.toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-yellow-400 text-xs mt-2">Select a country in Basics step first to see available leads.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Script Configuration</h2>
            <Field label="Script A (first attempt)">
              <select className={input} value={form.script_a_id} onChange={e => set('script_a_id', e.target.value)}>
                <option value="">Select script A...</option>
                {scriptsA.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
              </select>
            </Field>
            <Field label="Script B (second attempt)">
              <select className={input} value={form.script_b_id} onChange={e => set('script_b_id', e.target.value)}>
                <option value="">None (optional)</option>
                {scriptsB.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
              </select>
            </Field>
            <Field label="Script C (third attempt)">
              <select className={input} value={form.script_c_id} onChange={e => set('script_c_id', e.target.value)}>
                <option value="">None (optional)</option>
                {scriptsC.map(s => <option key={s.id} value={s.id}>{s.name} ({s.language_code})</option>)}
              </select>
            </Field>
            {scripts?.length === 0 && (
              <p className="text-yellow-400 text-xs mt-2">No scripts found. <a href="/scripts" className="underline">Create scripts first</a>.</p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Retry Logic</h2>
            <Field label="Max Attempts">
              <input className={input} type="number" min={1} max={10} value={form.max_attempts} onChange={e => set('max_attempts', e.target.value)} />
            </Field>
            <Field label="Retry Interval (minutes)">
              <input className={input} type="number" min={10} value={form.retry_interval_minutes} onChange={e => set('retry_interval_minutes', e.target.value)} />
            </Field>
            <Field label="Concurrency Limit">
              <input className={input} type="number" min={1} max={100} value={form.concurrency_limit} onChange={e => set('concurrency_limit', e.target.value)} />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Call Window</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Time">
                <input className={input} type="time" value={form.call_window_start} onChange={e => set('call_window_start', e.target.value)} />
              </Field>
              <Field label="End Time">
                <input className={input} type="time" value={form.call_window_end} onChange={e => set('call_window_end', e.target.value)} />
              </Field>
            </div>
            <Field label="Timezone">
              <select className={input} value={form.call_window_timezone} onChange={e => set('call_window_timezone', e.target.value)}>
                {['UTC','America/New_York','America/Los_Angeles','Europe/London','Europe/Berlin','Europe/Madrid','Asia/Tokyo'].map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Review & Launch</h2>
            <div className="space-y-2 text-sm">
              {reviewRows.map(([label, val]) => (
                <div key={label} className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 transition-colors text-sm"
          >
            Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !form.name}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-30 text-white text-sm transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}
