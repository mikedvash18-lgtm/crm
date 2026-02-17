import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignApi } from '../../api';
import toast from 'react-hot-toast';

const STEPS = ['Basics', 'Scripts', 'Retry Logic', 'Call Window', 'Review'];

export default function CampaignBuilder() {
  const [step, setStep]     = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate            = useNavigate();

  const [form, setForm] = useState({
    name: '', broker_id: '', country_id: '',
    script_a_id: '', script_b_id: '', script_c_id: '',
    max_attempts: 3, retry_interval_minutes: 60,
    concurrency_limit: 10,
    call_window_start: '09:00', call_window_end: '20:00',
    call_window_timezone: 'UTC', caller_id: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
            }`}>{i < step ? '✓' : i + 1}</div>
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
            <Field label="Broker ID">
              <input className={input} type="number" value={form.broker_id} onChange={e => set('broker_id', e.target.value)} placeholder="Broker ID" />
            </Field>
            <Field label="Country ID">
              <input className={input} type="number" value={form.country_id} onChange={e => set('country_id', e.target.value)} placeholder="Country ID" />
            </Field>
            <Field label="Caller ID (phone number)">
              <input className={input} value={form.caller_id} onChange={e => set('caller_id', e.target.value)} placeholder="+12025551234" />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white mb-4">Script Configuration</h2>
            <Field label="Script A (first attempt)">
              <input className={input} type="number" value={form.script_a_id} onChange={e => set('script_a_id', e.target.value)} placeholder="Script A ID" />
            </Field>
            <Field label="Script B (second attempt)">
              <input className={input} type="number" value={form.script_b_id} onChange={e => set('script_b_id', e.target.value)} placeholder="Script B ID (optional)" />
            </Field>
            <Field label="Script C (third attempt)">
              <input className={input} type="number" value={form.script_c_id} onChange={e => set('script_c_id', e.target.value)} placeholder="Script C ID (optional)" />
            </Field>
          </div>
        )}

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Review & Launch</h2>
            <div className="space-y-2 text-sm">
              {Object.entries(form).map(([k, v]) => v ? (
                <div key={k} className="flex justify-between py-1 border-b border-gray-800">
                  <span className="text-gray-400">{k.replace(/_/g, ' ')}</span>
                  <span className="text-white">{String(v)}</span>
                </div>
              ) : null)}
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
              {loading ? 'Creating…' : 'Create Campaign'}
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
