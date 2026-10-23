'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  XCircle,
  FileText,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ImportSummary {
  total_rows: number;
  inserted: number;
  duplicates_in_file: number;
  invalid_count: number;
  invalid_rows: { rowNumber: number; reason: string }[];
}

export default function LeadImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Upload, 2: Map & Preview, 3: Summary

  // Column Mapping
  const [mapping, setMapping] = useState<any>({
    email: '',
    first_name: '',
    last_name: '',
    full_name: '',
    company: '',
    job_title: '',
    website: '',
    phone: '',
    category: '',
    city: '',
    country: '',
    rating: '',
    review_count: '',
    qualification_score: '',
    personalization_hook: '',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.match(/\.(csv|xlsx|xls)$/i)) {
      setError('Please upload a valid CSV or Excel (.xlsx, .xls) file.');
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setFile(selected);

    // Parse file
    if (selected.name.endsWith('.csv')) {
      Papa.parse(selected, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const fields = results.meta.fields || [];
          setHeaders(fields);
          setPreviewRows(results.data.slice(0, 5));
          setAllRows(results.data);
          autoMap(fields);
          setStep(2);
        },
        error: (err) => {
          setError(`Error parsing CSV: ${err.message}`);
        },
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = evt.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(firstSheet, { defval: '' });
          if (json.length > 0) {
            const fields = Object.keys(json[0]);
            setHeaders(fields);
            setPreviewRows(json.slice(0, 5));
            setAllRows(json);
            autoMap(fields);
            setStep(2);
          } else {
            setError('The Excel file appears to be empty.');
          }
        } catch (err: any) {
          setError(`Error parsing Excel file: ${err.message}`);
        }
      };
      reader.readAsBinaryString(selected);
    }
  };

  const autoMap = (fields: string[]) => {
    const newMapping = { ...mapping };
    fields.forEach((f) => {
      const lower = f.toLowerCase().replace(/[-_ ]/g, '');
      if (!newMapping.email && (lower === 'email' || lower === 'targetcoldemail' || lower === 'targetemail' || lower === 'emailaddress' || lower === 'mail' || lower === 'contactemail')) {
        newMapping.email = f;
      } else if (!newMapping.first_name && (lower === 'firstname' || lower === 'fname' || lower === 'givenname')) {
        newMapping.first_name = f;
      } else if (!newMapping.last_name && (lower === 'lastname' || lower === 'lname' || lower === 'surname')) {
        newMapping.last_name = f;
      } else if (!newMapping.full_name && (lower === 'name' || lower === 'fullname' || lower === 'contactname')) {
        newMapping.full_name = f;
      } else if (!newMapping.company && (lower === 'businessname' || lower === 'company' || lower === 'companyname' || lower === 'organization' || lower === 'org' || lower === 'business' || lower === 'practicename')) {
        newMapping.company = f;
      } else if (!newMapping.job_title && (lower === 'jobtitle' || lower === 'title' || lower === 'role')) {
        newMapping.job_title = f;
      } else if (!newMapping.website && (lower === 'websiteurl' || lower === 'website' || lower === 'url' || lower === 'domain' || lower === 'site')) {
        newMapping.website = f;
      } else if (!newMapping.phone && (lower === 'phonenumber' || lower === 'phone' || lower === 'tel' || lower === 'mobile')) {
        newMapping.phone = f;
      } else if (!newMapping.category && (lower === 'categoryniche' || lower === 'category' || lower === 'niche' || lower === 'industry')) {
        newMapping.category = f;
      } else if (!newMapping.city && (lower === 'cityarea' || lower === 'city' || lower === 'area' || lower === 'location')) {
        newMapping.city = f;
      } else if (!newMapping.country && lower === 'country') {
        newMapping.country = f;
      } else if (!newMapping.rating && (lower === 'googlerating' || lower === 'rating' || lower === 'stars')) {
        newMapping.rating = f;
      } else if (!newMapping.review_count && (lower === 'googlereviewcount' || lower === 'reviewcount' || lower === 'reviews')) {
        newMapping.review_count = f;
      } else if (!newMapping.qualification_score && (lower === 'leadqualificationscore' || lower === 'qualificationscore' || lower === 'score')) {
        newMapping.qualification_score = f;
      } else if (!newMapping.personalization_hook && (lower === 'coldemailpersonalizationhook' || lower === 'personalizationhook' || lower === 'hook' || lower === 'suggestedopening')) {
        newMapping.personalization_hook = f;
      } else if (!newMapping.notes && (lower === 'notes' || lower === 'note' || lower === 'bio')) {
        newMapping.notes = f;
      }
    });
    setMapping(newMapping);
  };

  const handleExecuteImport = async () => {
    if (!mapping.email) {
      setError('Please select which column contains the prospect Email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: allRows,
          headers,
          mapping,
          filename: file?.name || 'import.csv',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Import failed');
      }

      setSummary(data);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header title="Lead Import Wizard" subtitle="Upload CSV or Excel files with auto-mapping and suppression checks" />

        <main className="p-8 max-w-4xl w-full mx-auto space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 1 ? 'text-indigo-400' : 'text-slate-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 1 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>1</span>
              <span>Upload File</span>
            </div>
            <div className="w-12 h-px bg-slate-800" />
            <div className={`flex items-center gap-2 text-xs font-semibold ${step >= 2 ? 'text-indigo-400' : 'text-slate-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= 2 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>2</span>
              <span>Map & Preview</span>
            </div>
            <div className="w-12 h-px bg-slate-800" />
            <div className={`flex items-center gap-2 text-xs font-semibold ${step === 3 ? 'text-indigo-400' : 'text-slate-600'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>3</span>
              <span>Summary</span>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="space-y-4">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl bg-slate-900/30 cursor-pointer transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
                </div>
                <div className="text-sm font-medium text-slate-200">Click to select CSV or Excel (.xlsx) file</div>
                <div className="text-xs text-slate-400 mt-1">Supports up to 10MB spreadsheets</div>
                <input
                  id="file-upload"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/20 text-xs text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 mb-1">Standard Recommended Columns:</div>
                <p>• Email (Required), First Name, Last Name, Company, Job Title, Website, Notes.</p>
                <p>• Duplicate leads within the file and previously enrolled leads are detected automatically.</p>
              </div>
            </div>
          )}

          {/* STEP 2: MAP & PREVIEW */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <div>
                    <div className="text-sm font-medium text-white">{file?.name}</div>
                    <div className="text-xs text-slate-400">{allRows.length} total rows detected</div>
                  </div>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Change file
                </button>
              </div>

              {/* Column Mapping Selectors */}
              <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30 space-y-4">
                <h3 className="text-sm font-semibold text-white">Map Columns</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Email Address <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={mapping.email}
                      onChange={(e) => setMapping({ ...mapping, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">First Name</label>
                    <select
                      value={mapping.first_name}
                      onChange={(e) => setMapping({ ...mapping, first_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Last Name</label>
                    <select
                      value={mapping.last_name}
                      onChange={(e) => setMapping({ ...mapping, last_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Company</label>
                    <select
                      value={mapping.company}
                      onChange={(e) => setMapping({ ...mapping, company: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Job Title</label>
                    <select
                      value={mapping.job_title}
                      onChange={(e) => setMapping({ ...mapping, job_title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Prospect Notes / Context</label>
                    <select
                      value={mapping.notes}
                      onChange={(e) => setMapping({ ...mapping, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Category / Niche</label>
                    <select
                      value={mapping.category}
                      onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">City / Area</label>
                    <select
                      value={mapping.city}
                      onChange={(e) => setMapping({ ...mapping, city: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Phone Number</label>
                    <select
                      value={mapping.phone}
                      onChange={(e) => setMapping({ ...mapping, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Google Rating</label>
                    <select
                      value={mapping.rating}
                      onChange={(e) => setMapping({ ...mapping, rating: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Google Review Count</label>
                    <select
                      value={mapping.review_count}
                      onChange={(e) => setMapping({ ...mapping, review_count: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Cold Email Personalization Hook</label>
                    <select
                      value={mapping.personalization_hook}
                      onChange={(e) => setMapping({ ...mapping, personalization_hook: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Lead Qualification Score</label>
                    <select
                      value={mapping.qualification_score}
                      onChange={(e) => setMapping({ ...mapping, qualification_score: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200"
                    >
                      <option value="">-- None / Select Column --</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  <span className="font-semibold text-indigo-400">Automatic Enrichment:</span> All remaining fields (such as Footfall_Tier, Current_Booking_Setup, AI_Chat_Widget_Status, Automated_Booking_Status, and Email_Source_Type) are automatically captured and used directly by the AI cold email generator.
                </div>
              </div>

              {/* Data Preview */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview (First 5 Rows)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        {headers.slice(0, 6).map((h) => (
                          <th key={h} className="pb-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {headers.slice(0, 6).map((h) => (
                            <td key={h} className="py-2 pr-3 truncate max-w-[150px]">{String(row[h] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 disabled:opacity-50 transition-colors"
                >
                  <span>{loading ? 'Processing & Validating...' : 'Confirm & Import Leads'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: SUMMARY */}
          {step === 3 && summary && (
            <div className="space-y-6">
              <div className="p-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h3 className="text-xl font-bold text-white">Import Successfully Completed</h3>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  Your lead file has been processed, checked against suppression lists and duplicates, and inserted into your database.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                  <div className="text-xs text-slate-400">Total Rows</div>
                  <div className="text-xl font-bold text-white mt-1">{summary.total_rows}</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                  <div className="text-xs text-slate-400">Successfully Imported</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">{summary.inserted}</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                  <div className="text-xs text-slate-400">Duplicates Skipped</div>
                  <div className="text-xl font-bold text-amber-400 mt-1">{summary.duplicates_in_file}</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                  <div className="text-xs text-slate-400">Invalid / Suppressed</div>
                  <div className="text-xl font-bold text-rose-400 mt-1">{summary.invalid_count}</div>
                </div>
              </div>

              {summary.invalid_rows.length > 0 && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Skipped Row Details:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-[11px] text-slate-400">
                    {summary.invalid_rows.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-mono text-slate-500">Row {r.rowNumber}:</span>
                        <span>{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <Link
                  href="/leads"
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  View All Leads
                </Link>
                <Link
                  href="/campaigns/new"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30 transition-colors"
                >
                  <span>Create Campaign with Leads</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
