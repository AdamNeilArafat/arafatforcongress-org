import React, { useState } from 'react';
import { parseCsvText } from '../../lib/csv/parse';
import { saveUploadedRows } from '../../lib/csv/storage';

export default function AdminUploadPage() {
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  async function onFile(file: File) {
    const text = await file.text();
    const result = await parseCsvText(text, setProgress);
    saveUploadedRows(result.rows);
    setMessage(`Processed ${result.processed} rows, ${result.errors.length} validation errors, ${result.rows.length} rows saved for reporting.`);
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
