import React, { useState } from 'react';
import { parseCsvText } from '../../lib/csv/parse';
import { importRows } from '../../lib/db/store';

export default function AdminUploadPage() {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  async function onFile(file: File) {
    const text = await file.text();
    const result = await parseCsvText(text, setProgress);
    const batch = importRows(file.name, result.rows, result.errors.length);
    setMessage(`Inserted ${batch.inserted_count}. Duplicates skipped ${batch.duplicate_count}. Invalid rows ${batch.invalid_count}. Pinned now ${batch.pinnable_count}. Geocode queued ${batch.geocode_queued_count}. Blocked ${batch.blocked_count}.`);
  }

  return (
    <main>
      <h1>Admin CSV Upload</h1>
      <input type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <p>Rows processed: {progress}</p>
      <p>{message}</p>
    </main>
  );
}
