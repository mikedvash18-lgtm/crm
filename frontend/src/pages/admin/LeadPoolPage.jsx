import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { leadPoolApi, countryApi } from '../../api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const statusColors = {
  available: 'bg-green-900 text-green-300',
  claimed:   'bg-yellow-900 text-yellow-300',
};

export default function LeadPoolPage() {
  const [filters, setFilters] = useState({ country_id: '', source: '', status: '', phone: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [uploadModal, setUploadModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery(['lead-pool', filters, page], () =>
    leadPoolApi.list({ ...filters, page, per_page: 50 }).then(r => r.data.data)
  );

  const { data: countries } = useQuery('countries-list', () =>
    countryApi.list().then(r => r.data.data || [])
  );

  const { data: sources } = useQuery('pool-sources', () =>
    leadPoolApi.sources().then(r => r.data.data || [])
  );

  const f = (k, v) => { setFilters(prev => ({ ...prev, [k]: v })); setPage(1); };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Lead Pool</h1>
          <p className="text-gray-400 text-sm mt-1">{data?.total?.toLocaleString() ?? 0} total pool leads</p>
        </div>
        <button onClick={() => setUploadModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          Upload to Pool
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          className="bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
          placeholder="Search phone..."
          value={filters.phone}
          onChange={e => f('phone', e.target.value)}
        />
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.country_id}
          onChange={e => f('country_id', e.target.value)}
        >
          <option value="">All countries</option>
          {countries?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.source}
          onChange={e => f('source', e.target.value)}
        >
          <option value="">All sources</option>
          {sources?.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.status}
          onChange={e => f('status', e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="claimed">Claimed</option>
        </select>
        <input type="date" className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.date_from} onChange={e => f('date_from', e.target.value)} />
        <input type="date" className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none"
          value={filters.date_to} onChange={e => f('date_to', e.target.value)} />
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-6 py-3">Name</th>
              <th className="text-left px-6 py-3">Phone</th>
              <th className="text-left px-6 py-3">Country</th>
              <th className="text-left px-6 py-3">Source</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="text-left px-6 py-3">Claimed By</th>
              <th className="text-left px-6 py-3">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : data?.data?.map((lead) => (
              <tr key={lead.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                <td className="px-6 py-3 text-white">{lead.first_name} {lead.last_name}</td>
                <td className="px-6 py-3 text-gray-300 font-mono text-xs">{lead.phone}</td>
                <td className="px-6 py-3 text-gray-400">{lead.country_name}</td>
                <td className="px-6 py-3 text-gray-400">{lead.source || '—'}</td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-gray-400 text-xs">{lead.claimed_by_campaign_name || '—'}</td>
                <td className="px-6 py-3 text-gray-500 text-xs">
                  {lead.uploaded_at ? new Date(lead.uploaded_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.total > 50 && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Prev</button>
          <span className="px-3 py-1 text-gray-400 text-sm">Page {page} of {Math.ceil(data.total / 50)}</span>
          <button disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 disabled:opacity-30 text-sm">Next</button>
        </div>
      )}

      {uploadModal && <PoolUploadModal onClose={() => setUploadModal(false)} onSuccess={() => { setUploadModal(false); qc.invalidateQueries('lead-pool'); qc.invalidateQueries('pool-sources'); }} />}
    </div>
  );
}

// Auto-detect field from header name
function guessField(header, nameMode) {
  const h = header.toLowerCase().trim();
  if (/^(phone|mobile|tel|telephone|phone.?number)$/i.test(h)) return 'phone';
  if (/^(country|country.?code|country.?name)$/i.test(h)) return 'country';
  if (/^(email|e.?mail|email.?address)$/i.test(h)) return 'email';
  if (/^(funnel|landing.?page|lp|page|campaign.?name)$/i.test(h)) return 'funnel';
  if (nameMode === 'full') {
    if (/^(full.?name|name|client.?name|customer.?name)$/i.test(h)) return 'full_name';
  } else {
    if (/^(first.?name|fname|given.?name)$/i.test(h)) return 'first_name';
    if (/^(last.?name|lname|surname|family.?name)$/i.test(h)) return 'last_name';
  }
  return '';
}

// Read only first N lines of a text file (avoids loading entire file)
function readFirstLines(file, n) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const slice = file.slice(0, 64 * 1024); // read first 64KB max
    reader.onload = () => {
      const lines = reader.result.split(/\r?\n/).filter(l => l.trim());
      resolve(lines.slice(0, n).join('\n'));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(slice);
  });
}

function PoolUploadModal({ onClose, onSuccess }) {
  // Step 1 state
  const [source, setSource] = useState('');
  const [file, setFile] = useState(null);
  const fileRef = useRef();

  // Step 2 state
  const [step, setStep] = useState(1);
  const [headers, setHeaders] = useState([]);
  const [preview, setPreview] = useState([]);
  const [nameMode, setNameMode] = useState('full'); // 'full' or 'split'
  const [mappings, setMappings] = useState({}); // { columnIndex: fieldName }
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(false);

  const fieldOptions = nameMode === 'full'
    ? ['', 'phone', 'country', 'full_name', 'email', 'funnel']
    : ['', 'phone', 'country', 'first_name', 'last_name', 'email', 'funnel'];

  const fieldLabels = {
    '': '(skip)',
    phone: 'Phone',
    country: 'Country',
    full_name: 'Full Name',
    first_name: 'First Name',
    last_name: 'Last Name',
    email: 'Email',
    funnel: 'Funnel',
  };

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    if (!selectedFile) return;
    setParsing(true);
    try {
      const ext = selectedFile.name.split('.').pop().toLowerCase();
      let h = [], p = [];

      if (ext === 'csv' || ext === 'txt') {
        // Parse CSV client-side — just read first 4 lines
        const text = await readFirstLines(selectedFile, 4);
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 1) throw new Error('Empty file');
        const parseRow = (line) => {
          const result = [];
          let inQuotes = false, field = '';
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
              if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
              else if (ch === '"') inQuotes = false;
              else field += ch;
            } else {
              if (ch === '"') inQuotes = true;
              else if (ch === ',') { result.push(field.trim()); field = ''; }
              else field += ch;
            }
          }
          result.push(field.trim());
          return result;
        };
        h = parseRow(lines[0]);
        for (let i = 1; i < Math.min(4, lines.length); i++) {
          p.push(parseRow(lines[i]));
        }
      } else {
        // Parse Excel client-side with SheetJS — read only first 4 rows
        const ab = await selectedFile.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array', sheetRows: 4 });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 1) throw new Error('Empty file');
        h = rows[0].map(v => String(v ?? '').trim());
        for (let i = 1; i < rows.length; i++) {
          p.push(rows[i].map(v => String(v ?? '').trim()));
        }
      }

      setHeaders(h);
      setPreview(p);
      // Auto-detect mappings
      const auto = {};
      const usedFields = new Set();
      h.forEach((header, idx) => {
        const guess = guessField(header, nameMode);
        if (guess && !usedFields.has(guess)) {
          auto[idx] = guess;
          usedFields.add(guess);
        }
      });
      setMappings(auto);
      setStep(2);
    } catch (err) {
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  };

  const handleNameModeChange = (newMode) => {
    setNameMode(newMode);
    // Re-run auto-detect with new mode
    const auto = {};
    const usedFields = new Set();
    headers.forEach((header, idx) => {
      const guess = guessField(header, newMode);
      if (guess && !usedFields.has(guess)) {
        auto[idx] = guess;
        usedFields.add(guess);
      }
    });
    setMappings(auto);
  };

  const setMapping = (colIdx, field) => {
    setMappings(prev => {
      const next = { ...prev };
      // If field is non-empty, clear any other column mapped to same field
      if (field) {
        for (const key of Object.keys(next)) {
          if (next[key] === field) delete next[key];
        }
        next[colIdx] = field;
      } else {
        delete next[colIdx];
      }
      return next;
    });
  };

  // Invert mappings: { field: columnIndex }
  const getColumnMap = () => {
    const map = {};
    for (const [colIdx, field] of Object.entries(mappings)) {
      if (field) map[field] = parseInt(colIdx);
    }
    return map;
  };

  const canUpload = () => {
    const map = getColumnMap();
    if (!map.phone || map.country === undefined) return false;
    if (nameMode === 'full' && !map.full_name) return false;
    if (nameMode === 'split' && !map.first_name) return false;
    return true;
  };

  const handleUpload = async () => {
    const columnMap = getColumnMap();
    if (!columnMap.phone) return toast.error('Phone column is required');
    if (columnMap.country === undefined) return toast.error('Country column is required');

    const fd = new FormData();
    fd.append('file', file);
    if (source) fd.append('source', source);
    for (const [field, idx] of Object.entries(columnMap)) {
      fd.append(`column_map[${field}]`, idx);
    }

    setLoading(true);
    try {
      const { data } = await leadPoolApi.upload(fd);
      const r = data.data;
      toast.success(`Uploaded: ${r.inserted} leads, ${r.duplicates} duplicates, ${r.skipped} skipped`);
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-900 rounded-xl border border-gray-800 p-6 w-full ${step === 2 ? 'max-w-3xl' : 'max-w-md'}`}>
        <h2 className="text-lg font-bold text-white mb-4">Upload to Lead Pool</h2>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Source (optional)</label>
              <input className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Facebook Ads Q1" value={source} onChange={e => setSource(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">File (CSV or Excel)</label>
              <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 transition-colors"
                onClick={() => fileRef.current.click()}>
                {parsing ? (
                  <p className="text-indigo-400 text-sm">Parsing file headers...</p>
                ) : (
                  <>
                    <p className="text-gray-400 text-sm">{file ? file.name : 'Click to select CSV or Excel file'}</p>
                    <p className="text-gray-600 text-xs mt-1">CSV, TXT, XLSX, or XLS</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
                  onChange={e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                File: <span className="text-white">{file?.name}</span> — {headers.length} columns detected
              </p>
              <button onClick={() => { setStep(1); setFile(null); setHeaders([]); setPreview([]); setMappings({}); fileRef.current && (fileRef.current.value = ''); }}
                className="text-xs text-indigo-400 hover:text-indigo-300">Change file</button>
            </div>

            {/* Name mode toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Name format:</span>
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button onClick={() => handleNameModeChange('full')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${nameMode === 'full' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}>
                  Full Name
                </button>
                <button onClick={() => handleNameModeChange('split')}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${nameMode === 'split' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-300'}`}>
                  First + Last Name
                </button>
              </div>
            </div>

            {/* Column mapper table */}
            <div className="overflow-x-auto border border-gray-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left px-4 py-2">File Column</th>
                    <th className="text-left px-4 py-2">Sample Data</th>
                    <th className="text-left px-4 py-2 w-48">Map To</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className="border-t border-gray-800">
                      <td className="px-4 py-2 text-white font-medium">{header || `Column ${idx + 1}`}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs font-mono">
                        {preview.slice(0, 2).map((row, ri) => (
                          <div key={ri} className="truncate max-w-[200px]">{row[idx] || '—'}</div>
                        ))}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={mappings[idx] || ''}
                          onChange={e => setMapping(idx, e.target.value)}
                        >
                          {fieldOptions.map(f => (
                            <option key={f} value={f}>{fieldLabels[f]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Validation hints */}
            <div className="text-xs text-gray-500 space-y-0.5">
              {!getColumnMap().phone && <p className="text-red-400">Phone column must be mapped</p>}
              {getColumnMap().country === undefined && <p className="text-red-400">Country column must be mapped (ISO2 code or name)</p>}
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-sm hover:bg-gray-700">Cancel</button>
              <button onClick={handleUpload} disabled={loading || !canUpload()}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold">
                {loading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
