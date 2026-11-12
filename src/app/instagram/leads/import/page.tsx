'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { InstagramIcon } from '@/components/InstagramIcon';
import { Upload, ArrowLeft, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function InstagramLeadImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [groupMode, setGroupMode] = useState<'new' | 'existing' | 'none'>('new');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [enrollCampaignId, setEnrollCampaignId] = useState('');
  const [allowMissingHandle, setAllowMissingHandle] = useState(true);

  const [mapping, setMapping] = useState<Record<string, string>>({
    instagram_handle: '',
    instagram_url: '',
    full_name: '',
    first_name: '',
    last_name: '',
    company: '',
    niche: '',
    bio: '',
    followers_count: '',
    website: '',
    city: '',
    email: '',
    phone: '',
    personalization_hook: '',
    notes: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/instagram/lead-groups').then((r) => r.json()),
      fetch('/api/instagram/campaigns').then((r) => r.json()),
    ])
      .then(([gData, cData]) => {
        if (Array.isArray(gData)) {
          setGroups(gData);
          if (gData.length > 0) setSelectedGroupId(gData[0].id);
        }
        if (Array.isArray(cData)) setCampaigns(cData);
      })
      .catch(() => {});
  }, []);

  const autoMap = (fields: string[]) => {
    const next: Record<string, string> = { ...mapping };
    const cleanMap = fields.map((f) => ({ orig: f, clean: f.toLowerCase().trim().replace(/[-_ ]/g, '') }));

    for (const { orig, clean } of cleanMap) {
      if (!next.instagram_handle && ['instagramhandle', 'ighandle', 'handle', 'instagram', 'ig', 'instagramusername', 'igusername', 'username'].includes(clean)) {
        next.instagram_handle = orig;
      } else if (!next.instagram_url && ['instagramurl', 'igurl', 'instagramlink', 'iglink', 'profileurl'].includes(clean)) {
        next.instagram_url = orig;
      } else if (!next.first_name && ['firstname', 'fname'].includes(clean)) {
        next.first_name = orig;
      } else if (!next.last_name && ['lastname', 'lname'].includes(clean)) {
        next.last_name = orig;
      } else if (!next.full_name && ['fullname', 'name', 'contactname', 'creatorname', 'foundername'].includes(clean)) {
        next.full_name = orig;
      } else if (!next.company && ['company', 'companyname', 'business', 'businessname', 'brand'].includes(clean)) {
        next.company = orig;
      } else if (!next.niche && ['niche', 'category', 'industry', 'categoryniche'].includes(clean)) {
        next.niche = orig;
      } else if (!next.bio && ['bio', 'biography', 'igbio', 'instagrambio', 'description'].includes(clean)) {
        next.bio = orig;
      } else if (!next.followers_count && ['followers', 'followerscount', 'followercount'].includes(clean)) {
        next.followers_count = orig;
      } else if (!next.website && ['website', 'websiteurl', 'url', 'domain'].includes(clean)) {
        next.website = orig;
      } else if (!next.city && ['city', 'location', 'cityarea'].includes(clean)) {
        next.city = orig;
      } else if (!next.email && ['email', 'emailaddress'].includes(clean)) {
        next.email = orig;
      } else if (!next.phone && ['phone', 'phonenumber', 'mobile'].includes(clean)) {
        next.phone = orig;
      } else if (!next.personalization_hook && ['personalizationhook', 'hook', 'dmhook', 'outreachhook', 'suggestedopening'].includes(clean)) {
        next.personalization_hook = orig;
      } else if (!next.notes && ['notes', 'note', 'summary', 'details'].includes(clean)) {
        next.notes = orig;
      }
    }
    setMapping(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setNewGroupName(
      selected.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    );

    if (selected.name.endsWith('.csv')) {
      Papa.parse(selected, {
        header: true,
        skipEmptyLines: 'greedy',
        complete: (results) => {
          const fields = results.meta.fields || [];
          setHeaders(fields);
          setAllRows(results.data);
          autoMap(fields);
          setStep(2);
        },
        error: (err) => setError(`Error parsing CSV: ${err.message}`),
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const workbook = XLSX.read(evt.target?.result, { type: 'binary' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
          if (json.length > 0) {
            const fields = Object.keys(json[0]);
            setHeaders(fields);
            setAllRows(json);
            autoMap(fields);
            setStep(2);
          } else {
            setError('Spreadsheet is empty.');
          }
        } catch (err: any) {
          setError(`Failed to parse Excel: ${err.message}`);
        }
      };
      reader.readAsBinaryString(selected);
    }
  };

  const handleImportSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/instagram/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: allRows,
          headers,
          mapping,
          filename: file?.name || 'import.csv',
          allow_missing_handle: allowMissingHandle,
          group_id: groupMode === 'existing' ? selectedGroupId : undefined,
          group_name: groupMode === 'new' ? newGroupName : undefined,
          enroll_campaign_id: enrollCampaignId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Import failed.');
      } else {
        setSummary(data);
        setStep(3);
      }
    } catch (err: any) {
      setError(err.message || 'Import error');
    } finally {
      setLoading(false);
    }
  };

  const fieldsList = [
    { key: 'instagram_handle', label: 'Instagram Handle (@username)' },
    { key: 'instagram_url', label: 'Instagram Profile URL' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'first_name', label: 'First Name' },
    { key: 'company', label: 'Company / Brand' },
    { key: 'niche', label: 'Niche / Category' },
    { key: 'bio', label: 'Instagram Bio' },
    { key: 'followers_count', label: 'Followers Count' },
    { key: 'website', label: 'Website' },
    { key: 'city', label: 'City' },
    { key: 'email', label: 'Email (Optional)' },
    { key: 'personalization_hook', label: 'Personalization Hook' },
    { key: 'notes', label: 'Notes / Context' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title="Import Instagram Leads"
          subtitle="Load leads with Instagram handles, bios, niches, and custom details for DM automation"
          category="Instagram DM"
        >
          <Link
            href="/instagram/leads"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to IG Leads</span>
          </Link>
        </Header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <div className="bg-slate-900 border border-dashed border-slate-700 rounded-2xl p-10 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100">Upload CSV or Excel File</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Supports <code className="text-fuchsia-300">instagram_handle</code>, <code className="text-fuchsia-300">instagram_url</code>, <code className="text-fuchsia-300">bio</code>, <code className="text-fuchsia-300">niche</code>, <code className="text-fuchsia-300">followers</code>, <code className="text-fuchsia-300">company</code>, and any extra custom columns for AI DM personalization.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white text-xs font-medium cursor-pointer">
                <InstagramIcon className="w-4 h-4" />
                <span>Choose CSV / XLSX File</span>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Map Columns ({allRows.length} rows detected)
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowMissingHandle}
                      onChange={(e) => setAllowMissingHandle(e.target.checked)}
                      className="rounded border-slate-700"
                    />
                    <span>Allow rows without @handle (add handles later)</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {fieldsList.map((field) => (
                    <div key={field.key}>
                      <label htmlFor={`map-${field.key}`} className="block text-[11px] text-slate-400 mb-1">
                        {field.label}
                      </label>
                      <select
                        id={`map-${field.key}`}
                        value={mapping[field.key] || ''}
                        onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                      >
                        <option value="">-- Skip --</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-200">IG Lead Group</div>
                  <div className="flex gap-2 text-xs">
                    {(['new', 'existing', 'none'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setGroupMode(m)}
                        className={`px-3 py-1 rounded-lg border ${
                          groupMode === m
                            ? 'bg-fuchsia-600 border-fuchsia-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {m === 'new' ? 'New Group' : m === 'existing' ? 'Existing' : 'No Group'}
                      </button>
                    ))}
                  </div>
                  {groupMode === 'new' && (
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Group name"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    />
                  )}
                  {groupMode === 'existing' && (
                    <select
                      value={selectedGroupId}
                      onChange={(e) => setSelectedGroupId(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                    >
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="auto-enroll-ig" className="block text-xs font-semibold text-slate-200">
                    Auto-Enroll into Instagram Campaign (optional)
                  </label>
                  <select
                    id="auto-enroll-ig"
                    value={enrollCampaignId}
                    onChange={(e) => setEnrollCampaignId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  >
                    <option value="">Just save to Instagram Leads</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-xs bg-slate-800 text-slate-300">
                  Choose Different File
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleImportSubmit}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white disabled:opacity-50"
                >
                  <span>{loading ? 'Importing...' : `Import ${allRows.length} Leads`}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && summary && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h2 className="text-lg font-semibold text-slate-100">Instagram Leads Imported</h2>
              <div className="flex justify-center gap-6 text-xs">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{summary.inserted}</div>
                  <div className="text-slate-400">Inserted</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-400">{summary.duplicates_in_file || 0}</div>
                  <div className="text-slate-400">Duplicates Skipped</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-rose-400">{summary.invalid_count || 0}</div>
                  <div className="text-slate-400">Invalid Rows</div>
                </div>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <Link href="/instagram/leads" className="px-4 py-2 rounded-lg text-xs bg-slate-800 text-slate-200 font-medium">
                  View IG Leads
                </Link>
                <Link
                  href={enrollCampaignId ? `/instagram/campaigns/${enrollCampaignId}` : '/instagram/campaigns'}
                  className="px-4 py-2 rounded-lg text-xs bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white font-medium"
                >
                  Go to IG Campaigns
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
