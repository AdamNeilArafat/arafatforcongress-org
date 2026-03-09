import React from 'react';
import { geocodeHouseholdsBatch } from '../../jobs/geocodeHouseholds';
import { parseCsvText } from '../../lib/csv/parse';
import { inferMappingForHeaders, VOTER_FIELDS, type VoterField } from '../../lib/csv/schema';
import {
  clearAll,
  clearByImport,
  deleteOutreachLog,
  deleteVoter,
  importRows,
  listAuditLogs,
  listImports,
  listMappingTemplates,
  listOutreachLogs,
  listTemplates,
  listVoters,
  logOutreach,
  saveMappingTemplate,
  saveTemplate,
  type Voter
} from '../../lib/db/store';
import { mergeScript } from '../../lib/scripts/merge';

type ParsedFile = {
  file: File;
  headers: string[];
  preview: Record<string, string | undefined>[];
  validRows: Record<string, string>[];
  errors: { line: number; problem: string }[];
  mapping: Record<string, VoterField>;
};

function useData() {
  const [rev, setRev] = React.useState(0);
  const refresh = () => setRev((n) => n + 1);
  return {
    rev,
    refresh,
    voters: listVoters(),
    imports: listImports(),
    audit: listAuditLogs().slice(0, 25),
    templates: listTemplates(),
    mappingTemplates: listMappingTemplates(),
    outreach: listOutreachLogs()
  };
}

function ImportPanel({ refresh, imports, mappingTemplates }: { refresh: () => void; imports: ReturnType<typeof listImports>; mappingTemplates: ReturnType<typeof listMappingTemplates> }) {
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [status, setStatus] = React.useState('');

  async function loadFiles(input: FileList) {
    const parsed: ParsedFile[] = [];
    for (const file of Array.from(input)) {
      const result = await parseCsvText(await file.text());
      const mapping: Record<string, VoterField> = inferMappingForHeaders(result.headers);
      parsed.push({ file, headers: result.headers, preview: result.preview, validRows: result.rows, errors: result.errors, mapping });
    }
    setFiles(parsed);
    setStatus(`Loaded ${parsed.length} file(s). Review column mapping below — map address, phone, and name columns to enable phone/text banking.`);
  }

  function applyTemplate(fileName: string, templateName: string) {
    const tpl = mappingTemplates[templateName];
    if (!tpl) return;
    setFiles((prev) => prev.map((pf) => {
      if (pf.file.name !== fileName) return pf;
      const merged: Record<string, VoterField> = { ...pf.mapping };
      for (const [col, field] of Object.entries(tpl)) {
        if (pf.headers.includes(col)) merged[col] = field as VoterField;
      }
      return { ...pf, mapping: merged };
    }));
  }

  async function runImport() {
    let inserted = 0;
    let queued = 0;
    let invalid = 0;
    for (const file of files) {
      const reparsed = await parseCsvText(await file.file.text(), undefined, file.mapping);
      const batch = importRows(file.file.name, reparsed.rows, reparsed.errors.length);
      inserted += batch.inserted_count;
      queued += batch.geocode_queued_count;
      invalid += batch.invalid_count;
    }
    setStatus(`Import complete. Inserted ${inserted} voters · ${queued} address geocode jobs queued · ${invalid} invalid rows skipped.`);
    setFiles([]);
    refresh();
  }

  const templateNames = Object.keys(mappingTemplates);

  return (
    <section>
      <h2>CSV Imports (append + dedupe)</h2>
      <p style={{ color: '#555' }}>Upload a voter CSV. Map each column to a field — especially <strong>address</strong>, <strong>city</strong>, <strong>state</strong>, <strong>zip</strong>, and <strong>phone</strong> — so records can be geocoded and used in phone/text banking.</p>
      <input type="file" accept=".csv" multiple onChange={(e) => e.target.files && loadFiles(e.target.files)} />
      <p>{status}</p>
      {files.map((f) => (
        <details key={f.file.name} open>
          <summary>
            {f.file.name} · {f.headers.length} columns · {f.validRows.length} valid rows · {f.errors.length} invalid
          </summary>
          <div style={{ margin: '8px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => saveMappingTemplate(f.file.name, f.mapping)}>Save mapping as template</button>
            {templateNames.length > 0 && (
              <select defaultValue="" onChange={(e) => { if (e.target.value) applyTemplate(f.file.name, e.target.value); }}>
                <option value="">Load saved mapping…</option>
                {templateNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
          </div>
          {f.errors.length > 0 && (
            <details style={{ color: 'red' }}>
              <summary>{f.errors.length} row error(s)</summary>
              <ul>{f.errors.slice(0, 20).map((e, i) => <li key={i}>Line {e.line}: {e.problem}</li>)}</ul>
            </details>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {f.headers.map((h) => (
                    <th key={h} style={{ border: '1px solid #ccc', padding: '4px 6px', background: f.mapping[h] ? '#e6f4ea' : '#fff' }}>
                      <div style={{ fontWeight: 'bold' }}>{h}</div>
                      <select
                        value={f.mapping[h] ?? ''}
                        style={{ fontSize: 11, maxWidth: 130 }}
                        onChange={(e) => {
                          const value = e.target.value as VoterField | '';
                          setFiles((prev) => prev.map((pf) => {
                            if (pf.file.name !== f.file.name) return pf;
                            const next = { ...pf.mapping };
                            if (value) next[h] = value; else delete next[h];
                            return { ...pf, mapping: next };
                          }));
                        }}
                      >
                        <option value="">-- ignore --</option>
                        {VOTER_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.preview.slice(0, 3).map((row, i) => (
                  <tr key={i}>
                    {f.headers.map((h) => <td key={h} style={{ border: '1px solid #eee', padding: '2px 6px' }}>{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            Mapped: {Object.entries(f.mapping).filter(([, v]) => v).map(([k, v]) => `${k} → ${v}`).join(' · ') || 'none'}
          </p>
        </details>
      ))}
      {files.length > 0 ? <button onClick={runImport} style={{ marginTop: 12, fontWeight: 'bold' }}>Import all files</button> : null}

      <h3>Import history</h3>
      <ul>
        {imports.map((batch) => (
          <li key={batch.id} style={{ marginBottom: 4 }}>
            <strong>{batch.source_file_name}</strong>: Inserted {batch.inserted_count} · Duplicates {batch.duplicate_count} · Invalid {batch.invalid_count} · Pinned {batch.pinnable_count} · Geocode queued {batch.geocode_queued_count} · Blocked {batch.blocked_count} · Geocode failed {batch.geocode_failed_count} ({batch.status})
            <button style={{ marginLeft: 8 }} onClick={() => { if (confirm('Clear this import batch?')) { clearByImport(batch.id); refresh(); } }}>Clear batch</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VoterList({ voters, refresh, imports }: { voters: Voter[]; refresh: () => void; imports: ReturnType<typeof listImports> }) {
  const [q, setQ] = React.useState('');
  const [importFilter, setImportFilter] = React.useState('all');
  const [selected, setSelected] = React.useState<Voter | null>(null);
  const [outcome, setOutcome] = React.useState('talked');
  const [notes, setNotes] = React.useState('');

  const filtered = voters.filter((v) => {
    if (importFilter !== 'all' && v.import_id !== importFilter) return false;
    const haystack = `${v.first_name ?? ''} ${v.last_name ?? ''} ${v.address_line1 ?? ''} ${v.city ?? ''}`.toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const detailLogs = selected ? listOutreachLogs(selected.id) : [];

  return (
    <section>
      <h2>Voter list ({filtered.length})</h2>
      <input placeholder="search voter/address" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={importFilter} onChange={(e) => setImportFilter(e.target.value)}>
        <option value="all">All imports</option>
        {imports.map((imp) => <option key={imp.id} value={imp.id}>{imp.source_file_name}</option>)}
      </select>
      <table>
        <thead><tr><th>Name</th><th>Address</th><th>Phone</th><th>Coords</th><th /></tr></thead>
        <tbody>
          {filtered.slice(0, 200).map((v) => (
            <tr key={v.id} onClick={() => setSelected(v)}>
              <td>{v.first_name} {v.last_name}</td>
              <td>{v.address_line1}, {v.city}</td>
              <td>{v.phone ?? '—'}</td>
              <td>{v.latitude != null && v.longitude != null ? 'pinned' : v.geocode_status}</td>
              <td><button onClick={(e) => { e.stopPropagation(); deleteVoter(v.id); refresh(); }}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <aside>
          <h3>Voter detail</h3>
          <p>{selected.first_name} {selected.last_name}</p>
          <p>{selected.address_line1}, {selected.city}, {selected.state} {selected.zip}</p>
          <p>Coords: {selected.latitude ?? '—'}, {selected.longitude ?? '—'}</p>
          <h4>Log outreach</h4>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="talked">talked</option><option value="not_home">not home</option><option value="refused">refused</option><option value="flyer_dropped">flyer dropped</option>
          </select>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="notes" />
          <div>
            <button onClick={() => { logOutreach({ voter_id: selected.id, channel: 'door', outcome, notes }); refresh(); }}>Log door</button>
            <button onClick={() => { logOutreach({ voter_id: selected.id, channel: 'phone', outcome, notes }); refresh(); }}>Log phone</button>
            <button onClick={() => { logOutreach({ voter_id: selected.id, channel: 'text', outcome, notes }); refresh(); }}>Log text</button>
          </div>
          <ul>
            {detailLogs.map((l) => <li key={l.id}>{l.channel}: {l.outcome} <button onClick={() => { deleteOutreachLog(l.id); refresh(); }}>delete</button></li>)}
          </ul>
        </aside>
      ) : null}
    </section>
  );
}

function MapPanel({ voters, refresh }: { voters: Voter[]; refresh: () => void }) {
  const pinned = voters.filter((v) => v.latitude != null && v.longitude != null);
  const pending = voters.filter((v) => v.geocode_status === 'pending').length;
  const blocked = voters.filter((v) => v.geocode_status === 'blocked_missing_fields').length;

  const toMapSearchUrl = (voter: Voter) => {
    const query = [voter.address_line1, voter.city, voter.state, voter.zip].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };

  return (
    <section>
      <h2>Map / Canvassing</h2>
      <p>Pins: {pinned.length} | Pending geocode: {pending} | Blocked: {blocked}</p>
      <button onClick={async () => { await geocodeHouseholdsBatch(50); refresh(); }}>Run Geocoding Now</button>
      <div style={{ border: '1px solid #ddd', width: 600, height: 300, position: 'relative', overflow: 'hidden' }}>
        {pinned.slice(0, 250).map((v) => {
          const x = (((v.longitude ?? 0) + 180) / 360) * 100;
          const y = (1 - (((v.latitude ?? 0) + 90) / 180)) * 100;
          return <span key={v.id} title={`${v.first_name} ${v.last_name}`} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 8, height: 8, background: 'red', borderRadius: '50%' }} />;
        })}
      </div>
      {voters.filter((v) => v.geocode_status === 'pending').length > 0 ? (
        <ul>
          {voters.filter((v) => v.geocode_status === 'pending').slice(0, 50).map((v) => (
            <li key={v.id}>{v.first_name} {v.last_name} · {[v.address_line1, v.city, v.state, v.zip].filter(Boolean).join(', ')} <a href={toMapSearchUrl(v)} target="_blank" rel="noreferrer">View pin</a></li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PhonePanel({ voters, refresh }: { voters: Voter[]; refresh: () => void }) {
  const eligible = voters.filter((v) => v.phone && !v.do_not_contact);
  const [idx, setIdx] = React.useState(0);
  const voter = eligible[idx];
  return (
    <section>
      <h2>Phone banking ({eligible.length})</h2>
      {voter ? (
        <>
          <p>{voter.first_name} {voter.last_name} · <a href={`tel:${voter.phone}`}>{voter.phone}</a></p>
          <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'phone', outcome: 'talked' }); setIdx((i) => i + 1); refresh(); }}>Log talked + next</button>
          <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'phone', outcome: 'no_answer' }); setIdx((i) => i + 1); refresh(); }}>No answer + next</button>
        </>
      ) : <p>0 callable/textable records because no phone data was provided.</p>}
    </section>
  );
}

function TextPanel({ voters, templates, refresh }: { voters: Voter[]; templates: ReturnType<typeof listTemplates>; refresh: () => void }) {
  const eligible = voters.filter((v) => v.phone && !v.do_not_contact);
  const [template, setTemplate] = React.useState('Hi {{first_name}}, can we count on your vote?');
  const [name, setName] = React.useState('Default');
  const [idx, setIdx] = React.useState(0);
  const voter = eligible[idx];

  return (
    <section>
      <h2>Text banking ({eligible.length})</h2>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="template name" />
      <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={3} cols={60} />
      <button onClick={() => { saveTemplate(name, template); refresh(); }}>Save template</button>
      <select onChange={(e) => setTemplate(e.target.value)}>
        <option>Load template</option>
        {templates.map((t) => <option key={t.id} value={t.body}>{t.name}</option>)}
      </select>
      {voter ? (
        <>
          <p>To: {voter.phone} ({voter.first_name} {voter.last_name})</p>
          <p>{mergeScript(template, { first_name: voter.first_name ?? 'neighbor', city: voter.city ?? '' })}</p>
          <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'text', outcome: 'sent', metadata_json: { provider: 'mock' } }); setIdx((i) => i + 1); refresh(); }}>Send (mock) + next</button>
        </>
      ) : <p>0 callable/textable records because no phone data was provided.</p>}
    </section>
  );
}

export default function AdminDashboardPage() {
  const data = useData();
  const [tab, setTab] = React.useState<'imports' | 'voters' | 'map' | 'phone' | 'text' | 'audit'>('imports');

  return (
    <main>
      <h1>District Ops Dashboard (DB-backed)</h1>
      <p>
        Continue to the full Field Ops Dashboard for volunteer workflows, reporting, and campaign operations:{' '}
        <a href="/admin/volunteer-dashboard.html" target="_blank" rel="noreferrer">
          Open Field Ops Dashboard ↗
        </a>
      </p>
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['imports', 'voters', 'map', 'phone', 'text', 'audit'].map((t) => <button key={t} onClick={() => setTab(t as typeof tab)}>{t}</button>)}
        <button onClick={() => { if (confirm('Clear ALL voters and outreach logs?')) { clearAll(); data.refresh(); } }}>Clear all</button>
      </nav>

      {tab === 'imports' && <ImportPanel imports={data.imports} refresh={data.refresh} mappingTemplates={data.mappingTemplates} />}
      {tab === 'voters' && <VoterList voters={data.voters} imports={data.imports} refresh={data.refresh} />}
      {tab === 'map' && <MapPanel voters={data.voters} refresh={data.refresh} />}
      {tab === 'phone' && <PhonePanel voters={data.voters} refresh={data.refresh} />}
      {tab === 'text' && <TextPanel voters={data.voters} templates={data.templates} refresh={data.refresh} />}
      {tab === 'audit' && (
        <section>
          <h2>Audit logs</h2>
          <ul>{data.audit.map((a) => <li key={a.id}>{a.created_at} · {a.action} · {a.entity}</li>)}</ul>
        </section>
      )}
      <p>Saved mapping templates: {Object.keys(data.mappingTemplates).join(', ') || 'none'}</p>
    </main>
  );
}
