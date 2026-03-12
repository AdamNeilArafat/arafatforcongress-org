import React, { useMemo, useState } from 'react';
import { geocodeHouseholdsBatch } from '../../jobs/geocodeHouseholds';
import { parseCsvText } from '../../lib/csv/parse';
import { clearAll, clearByImport, deleteVoter, importRows, listImports, listVoters, subscribeDbUpdates } from '../../lib/db/store';

export default function AdminUploadPage() {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);

  React.useEffect(() => subscribeDbUpdates(() => setVersion((x) => x + 1)), []);

  const imports = useMemo(() => listImports(), [version]);
  const voters = useMemo(() => listVoters(), [version]);

  async function onFiles(fileList: FileList) {
    const files = Array.from(fileList);
    for (const file of files) {
      const text = await file.text();
      const result = await parseCsvText(text, setProgress);
      const batch = importRows(file.name, result.rows, result.errors.length);
      setMessage(`Imported ${file.name}: inserted ${batch.inserted_count}, duplicates ${batch.duplicate_count}, invalid ${batch.invalid_count}, pinnable ${batch.pinnable_count}, geocode queued ${batch.geocode_queued_count}, blocked ${batch.blocked_count}, geocode failed ${batch.geocode_failed_count}. Feeders: phone ${batch.feeder_counts.phone_bank}, text ${batch.feeder_counts.text_bank}, outreach ${batch.feeder_counts.outreach}, mapping ${batch.feeder_counts.mapping}.`);
    }
    setVersion((x) => x + 1);
  }

  async function runWorker() {
    const result = await geocodeHouseholdsBatch(100);
    setMessage(`Worker complete: scanned ${result.scanned}, geocoded ${result.geocoded}, failed ${result.errors}`);
    setVersion((x) => x + 1);
  }

  return (
    <main>
      <h1>Admin CSV Upload</h1>
      <input type="file" multiple accept=".csv" onChange={(e) => e.target.files && onFiles(e.target.files)} />
      <button onClick={runWorker}>Run Geocode Worker</button>
      <button onClick={() => { clearAll(); setVersion((x) => x + 1); }}>Clear All</button>
      <p>Rows processed: {progress}</p>
      <p>{message}</p>

      <h2>Import batches</h2>
      <ul>
        {imports.map((batch) => (
          <li key={batch.id}>
            {batch.source_file_name}: inserted {batch.inserted_count}, duplicates {batch.duplicate_count}, invalid {batch.invalid_count}, pinnable {batch.pinnable_count}, queued {batch.geocode_queued_count}, blocked {batch.blocked_count}, failed {batch.geocode_failed_count}, feeders → phone {batch.feeder_counts?.phone_bank ?? 0}, text {batch.feeder_counts?.text_bank ?? 0}, outreach {batch.feeder_counts?.outreach ?? 0}, mapping {batch.feeder_counts?.mapping ?? 0}
            <button onClick={() => { clearByImport(batch.id); setVersion((x) => x + 1); }}>Clear Import</button>
          </li>
        ))}
      </ul>

      <h2>Voters</h2>
      <ul>
        {voters.slice(0, 30).map((voter) => (
          <li key={voter.id}>
            {voter.first_name} {voter.last_name} — {voter.full_address ?? 'no address'} — {voter.geocode_status}
            <button onClick={() => { deleteVoter(voter.id); setVersion((x) => x + 1); }}>Delete Row</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
