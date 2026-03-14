import React from 'react';
import { geocodeHouseholdsBatch } from '../../jobs/geocodeHouseholds';
import { parseCsvText } from '../../lib/csv/parse';
import { inferMappingForHeaders, type VoterField } from '../../lib/csv/schema';
import {
  assignVoter,
  clearAll,
  clearByImport,
  importRows,
  listAssignments,
  listAuditLogs,
  listEmailTemplates,
  listGeocodeJobs,
  listImports,
  listMappingTemplates,
  listOutreachLogs,
  listRoutePlans,
  listSuppressionEntries,
  listTemplates,
  listVolunteers,
  listVoters,
  logOutreach,
  saveEmailTemplate,
  saveMappingTemplate,
  saveRoutePlan,
  saveTemplate,
  subscribeDbUpdates,
  upsertVolunteer,
  type Voter
} from '../../lib/db/store';
import { mergeScript } from '../../lib/scripts/merge';
import SettingsV3Page from './settings-v3';
import MapRouteV3Panel from './map-route-v3';

type ParsedFile = {
  file: File;
  headers: string[];
  validRows: Record<string, string>[];
  errors: { line: number; problem: string }[];
  mapping: Record<string, VoterField>;
};

function useData() {
  const [rev, setRev] = React.useState(0);
  const refresh = () => setRev((n) => n + 1);
  React.useEffect(() => subscribeDbUpdates(refresh), []);
  void rev;
  const voters = listVoters();
  const outreach = listOutreachLogs();
  const imports = listImports();
  const volunteers = listVolunteers();
  const assignments = listAssignments();
  const suppressions = listSuppressionEntries();
  const geocodeJobs = listGeocodeJobs();

  return {
    refresh,
    voters,
    imports,
    volunteers,
    assignments,
    suppressions,
    geocodeJobs,
    templates: listTemplates(),
    emailTemplates: listEmailTemplates(),
    mappingTemplates: listMappingTemplates(),
    routes: listRoutePlans(),
    outreach,
    audit: listAuditLogs().slice(0, 30)
  };
}

function metricSet(voters: Voter[], imports: ReturnType<typeof listImports>, outreach: ReturnType<typeof listOutreachLogs>, suppressions: ReturnType<typeof listSuppressionEntries>, volunteers: ReturnType<typeof listVolunteers>) {
  const totalImports = imports.length;
  const mappedHouseholds = voters.filter((v) => v.latitude != null && v.longitude != null).length;
  const phones = voters.filter((v) => !!v.phone).length;
  const emails = voters.filter((v) => !!v.email).length;
  const textsSent = outreach.filter((o) => o.channel === 'text').length;
  const callsCompleted = outreach.filter((o) => o.channel === 'phone').length;
  const emailsSent = outreach.filter((o) => o.channel === 'email').length;
  const doorsKnocked = outreach.filter((o) => o.channel === 'door').length;
  const flyersDelivered = outreach.filter((o) => o.channel === 'flyer').length;
  const supporters = outreach.filter((o) => o.outcome === 'supporter').length;
  const undecideds = outreach.filter((o) => o.outcome === 'undecided').length;
  const followUpsDue = outreach.filter((o) => o.outcome === 'follow_up').length;
  const geocodePending = voters.filter((v) => v.geocode_status === 'pending').length;
  const geocodeFailed = voters.filter((v) => v.geocode_status === 'failed').length;

  return [
    ['Total imports', totalImports],
    ['Mapped households', mappedHouseholds],
    ['Geocode pending', geocodePending],
    ['Geocode failed', geocodeFailed],
    ['Phones', phones],
    ['Emails', emails],
    ['Texts sent', textsSent],
    ['Text opt-outs', suppressions.filter((s) => s.channel === 'text').length],
    ['Calls completed', callsCompleted],
    ['Emails sent', emailsSent],
    ['Doors knocked', doorsKnocked],
    ['Flyers delivered', flyersDelivered],
    ['Supporters', supporters],
    ['Undecideds', undecideds],
    ['Follow-ups due', followUpsDue],
    ['Volunteers active', volunteers.length]
  ] as const;
}

function CommandCenter({ data, refresh }: { data: ReturnType<typeof useData>; refresh: () => void }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [precinct, setPrecinct] = React.useState('');
  const [city, setCity] = React.useState('');
  const [support, setSupport] = React.useState('');

  const voters = data.voters
    .filter((v) => (precinct ? (v.precinct ?? '') === precinct : true))
    .filter((v) => (city ? (v.city ?? '') === city : true))
    .filter((v) => {
      if (!support) return true;
      const logs = data.outreach.filter((o) => o.voter_id === v.id);
      return logs.some((l) => l.outcome === support);
    });

  const pins = voters.filter((v) => v.latitude != null && v.longitude != null).slice(0, 300);
  const metrics = metricSet(data.voters, data.imports, data.outreach, data.suppressions, data.volunteers);
  const precincts = Array.from(new Set(data.voters.map((v) => v.precinct).filter(Boolean))).sort();
  const cities = Array.from(new Set(data.voters.map((v) => v.city).filter(Boolean))).sort();

  const [geocodeStatus, setGeocodeStatus] = React.useState('');

  async function runGeocodeBatch() {
    setGeocodeStatus('Running geocoding batch...');
    const result = await geocodeHouseholdsBatch(200);
    setGeocodeStatus(`Geocode batch complete: scanned ${result.scanned}, success ${result.geocoded}, errors ${result.errors}.`);
    refresh();
  }

  const bulkAssign = () => {
    if (selected.length === 0) return;
    const volunteer = data.volunteers[0] ?? upsertVolunteer('Unassigned Pool');
    selected.forEach((id) => assignVoter(id, volunteer.id, 'canvass'));
    refresh();
  };

  return (
    <section>
      <h2>Map-First Command Center</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        {metrics.map(([k, v]) => <div key={k} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}><div style={{ fontSize: 12, color: '#666' }}>{k}</div><strong style={{ fontSize: 24 }}>{v}</strong></div>)}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <select value={precinct} onChange={(e) => setPrecinct(e.target.value)}><option value="">All precincts</option>{precincts.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities</option>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={support} onChange={(e) => setSupport(e.target.value)}>
          <option value="">All support levels</option>
          <option value="supporter">supporter</option><option value="undecided">undecided</option><option value="opposed">opposed</option><option value="follow_up">follow_up</option>
        </select>
        <button onClick={bulkAssign}>Bulk assign selected to canvass</button>
        <button onClick={runGeocodeBatch}>Run geocode batch</button>
      </div>

      <div style={{ marginTop: 10, border: '1px solid #ddd', height: 360, position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'linear-gradient(180deg,#f8fbff,#eef4ff)' }}>
        {pins.map((v) => {
          const x = (((v.longitude ?? 0) + 180) / 360) * 100;
          const y = (1 - (((v.latitude ?? 0) + 90) / 180)) * 100;
          const householdSize = data.voters.filter((w) => w.address_line1 === v.address_line1 && w.zip === v.zip).length;
          return <button key={v.id} title={`${v.first_name} ${v.last_name} • HH ${householdSize}`} onClick={() => setSelected((s) => s.includes(v.id) ? s.filter((id) => id !== v.id) : [...s, v.id])} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: householdSize > 2 ? 11 : 8, height: householdSize > 2 ? 11 : 8, borderRadius: '50%', border: 0, background: selected.includes(v.id) ? '#7c3aed' : '#ef4444', cursor: 'pointer' }} />;
        })}
      </div>
      <p>Cluster proxy: larger dots imply multi-voter households. Heatmap proxy: dense pin areas indicate turf hotspots.</p>
      <p>Open geocode jobs: {data.geocodeJobs.filter((j) => j.status === 'queued' || j.status === 'processing').length}</p>
      {geocodeStatus ? <p>{geocodeStatus}</p> : null}
    </section>
  );
}

function ImportPanel({
  refresh,
  mappingTemplates,
  imports
}: {
  refresh: () => void;
  mappingTemplates: ReturnType<typeof listMappingTemplates>;
  imports: ReturnType<typeof listImports>;
}) {
  const [files, setFiles] = React.useState<ParsedFile[]>([]);
  const [status, setStatus] = React.useState('');

  async function loadFiles(input: FileList) {
    const parsed: ParsedFile[] = [];
    for (const file of Array.from(input)) {
      const result = await parseCsvText(await file.text());
      const mapping: Record<string, VoterField> = inferMappingForHeaders(result.headers);
      parsed.push({ file, headers: result.headers, validRows: result.rows, errors: result.errors, mapping });
    }
    setFiles(parsed);
  }

  async function runImport() {
    let inserted = 0;
    let lastFeeders = { phone_bank: 0, text_bank: 0, outreach: 0, mapping: 0 };
    for (const file of files) {
      const reparsed = await parseCsvText(await file.file.text(), undefined, file.mapping);
      const batch = importRows(file.file.name, reparsed.rows, reparsed.errors.length);
      inserted += batch.inserted_count;
      lastFeeders = batch.feeder_counts;
    }
    setStatus(`Imported ${inserted} records. Reimports now merge selected fields into existing voters. Feeders now: phone ${lastFeeders.phone_bank}, text ${lastFeeders.text_bank}, outreach ${lastFeeders.outreach}, mapping ${lastFeeders.mapping}.`);
    setFiles([]);
    refresh();
  }

  function clearOldImports() {
    const oldImports = imports.slice(1);
    if (oldImports.length === 0) {
      setStatus('No older list found to clear.');
      return;
    }
    oldImports.forEach((batch) => clearByImport(batch.id));
    setStatus(`Cleared ${oldImports.length} older import list${oldImports.length === 1 ? '' : 's'} and related voter records.`);
    refresh();
  }

  return (
    <section>
      <h3>CSV Master Input</h3>
      <input type="file" accept=".csv" multiple onChange={(e) => e.target.files && loadFiles(e.target.files)} />
      <button onClick={runImport}>Run import</button>
      <button onClick={clearOldImports}>Clear old lists (keep newest)</button>
      <p>{status}</p>
      <p>Saved mappings: {Object.keys(mappingTemplates).join(', ') || 'none'}</p>
      <p>Import history: {imports.length === 0 ? 'none' : `${imports.length} total`}</p>
      {imports.slice(0, 6).map((batch, index) => (
        <div key={batch.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <span>
            {index === 0 ? 'Newest' : 'Older'} · {batch.source_file_name} · {batch.inserted_count} inserted
          </span>
          {index > 0 ? <button onClick={() => { clearByImport(batch.id); refresh(); }}>Clear list</button> : null}
        </div>
      ))}
      {files.map((f) => <button key={f.file.name} onClick={() => saveMappingTemplate(f.file.name, f.mapping)}>Save mapping for {f.file.name}</button>)}
    </section>
  );
}

function RoutePanel({ voters, volunteers, refresh }: { voters: Voter[]; volunteers: ReturnType<typeof listVolunteers>; refresh: () => void }) {
  const [mode, setMode] = React.useState<'walking' | 'driving'>('walking');
  const [name, setName] = React.useState('Turf A');

  const mappable = voters.filter((v) => v.latitude != null && v.longitude != null).slice(0, 25);

  const estimate = () => {
    const factor = mode === 'walking' ? 0.7 : 1.8;
    const distance = Math.round(mappable.length * factor * 10) / 10;
    const minutes = Math.round(distance / (mode === 'walking' ? 4.5 : 28) * 60);
    return { distance, minutes };
  };

  const buildRoute = () => {
    const est = estimate();
    saveRoutePlan({ name, mode, voter_ids: mappable.map((v) => v.id), volunteer_id: volunteers[0]?.id, start_label: 'Campaign HQ', end_label: 'Campaign HQ', estimated_distance_km: est.distance, estimated_minutes: est.minutes, status: 'planned' });
    refresh();
  };

  const est = estimate();
  return <section><h3>Route optimization</h3><p>OSRM-ready routing scaffold with walk/drive mode, start/end points, and exportable route metadata.</p><select value={mode} onChange={(e) => setMode(e.target.value as 'walking' | 'driving')}><option value="walking">walking</option><option value="driving">driving</option></select><input value={name} onChange={(e) => setName(e.target.value)} /><p>Estimated {est.distance} km / {est.minutes} minutes for {mappable.length} stops.</p><button onClick={buildRoute}>Create route plan</button></section>;
}

function OutreachPanel({ data, refresh }: { data: ReturnType<typeof useData>; refresh: () => void }) {
  const voter = data.voters.find((v) => v.phone || v.email);
  const [textTemplate, setTextTemplate] = React.useState('Hi {{first_name}}, thanks for supporting Arafat. Can we count on your vote?');
  const [emailTemplate, setEmailTemplateBody] = React.useState('Hello {{first_name}},\n\nWe would love your support.');

  if (!voter) return <p>No contactable voters yet.</p>;

  return (
    <section>
      <h3>Text / Email / Phone / Canvass / Flyer</h3>
      <p>Current voter: {voter.first_name} {voter.last_name}</p>
      <p>Text preview: {mergeScript(textTemplate, { first_name: voter.first_name ?? 'neighbor' })}</p>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'text', outcome: 'sent' }); refresh(); }}>Send text</button>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'text', outcome: 'sent', notes: 'STOP' }); refresh(); }}>Simulate STOP opt-out</button>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'phone', outcome: 'supporter' }); refresh(); }}>Phone: supporter</button>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'door', outcome: 'follow_up' }); refresh(); }}>Canvass: follow_up</button>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'flyer', outcome: 'flyer_dropped' }); refresh(); }}>Flyer delivered</button>
      <button onClick={() => { logOutreach({ voter_id: voter.id, channel: 'email', outcome: 'sent' }); refresh(); }}>Send email</button>
      <div><textarea value={textTemplate} onChange={(e) => setTextTemplate(e.target.value)} rows={3} cols={60} /><button onClick={() => { saveTemplate('Default Text', textTemplate); refresh(); }}>Save text template</button></div>
      <div><textarea value={emailTemplate} onChange={(e) => setEmailTemplateBody(e.target.value)} rows={3} cols={60} /><button onClick={() => { saveEmailTemplate('Default Email', emailTemplate); refresh(); }}>Save email template</button></div>
    </section>
  );
}

function AnalyticsPanel({ data }: { data: ReturnType<typeof useData> }) {
  const byChannel = ['text', 'phone', 'email', 'door', 'flyer'].map((channel) => ({
    channel,
    total: data.outreach.filter((o) => o.channel === channel).length,
    contacted: data.outreach.filter((o) => o.channel === channel && o.outcome === 'contacted').length,
    supporter: data.outreach.filter((o) => o.channel === channel && o.outcome === 'supporter').length
  }));

  return <section><h3>Manager analytics</h3><table><thead><tr><th>Channel</th><th>Total</th><th>Contact rate</th><th>Supporter ID rate</th></tr></thead><tbody>{byChannel.map((row) => <tr key={row.channel}><td>{row.channel}</td><td>{row.total}</td><td>{row.total ? Math.round(row.contacted / row.total * 100) : 0}%</td><td>{row.total ? Math.round(row.supporter / row.total * 100) : 0}%</td></tr>)}</tbody></table><p>Routes planned: {data.routes.length} · Assignments: {data.assignments.length}</p></section>;
}

export default function AdminDashboardPage() {
  const data = useData();
  const [tab, setTab] = React.useState<'command' | 'imports' | 'routes' | 'outreach' | 'analytics' | 'audit'>('command');

  return (
    <main style={{ fontFamily: 'Inter,system-ui,sans-serif', margin: '16px auto', maxWidth: 1200, padding: '0 16px' }}>
      <h1>Campaign Operations Hub</h1>
      <p>CSV is the master source of truth for voters, map readiness, assignments, and all outreach channels.</p>
      <p><a href="/volunteer/texts">Text Banking</a> · <a href="/volunteer/calls">Phone Banking</a> · <a href="/volunteer/map">Volunteer Map</a></p>
      <SettingsV3Page />
      <MapRouteV3Panel />
      <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['command', 'imports', 'routes', 'outreach', 'analytics', 'audit'].map((t) => <button key={t} onClick={() => setTab(t as typeof tab)}>{t}</button>)}
        <button onClick={() => { if (confirm('Clear all ops data?')) { clearAll(); data.refresh(); } }}>Clear all</button>
      </nav>
      {tab === 'command' && <CommandCenter data={data} refresh={data.refresh} />}
      {tab === 'imports' && <ImportPanel refresh={data.refresh} mappingTemplates={data.mappingTemplates} imports={data.imports} />}
      {tab === 'routes' && <RoutePanel voters={data.voters} volunteers={data.volunteers} refresh={data.refresh} />}
      {tab === 'outreach' && <OutreachPanel data={data} refresh={data.refresh} />}
      {tab === 'analytics' && <AnalyticsPanel data={data} />}
      {tab === 'audit' && <section><h3>Audit</h3><ul>{data.audit.map((a) => <li key={a.id}>{a.created_at} · {a.action}</li>)}</ul></section>}
    </main>
  );
}
