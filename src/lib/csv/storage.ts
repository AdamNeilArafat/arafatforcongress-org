import type { ParsedVoterRow } from './report';

const STORAGE_KEY = 'afc_uploaded_voter_rows';

export function saveUploadedRows(rows: ParsedVoterRow[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function loadUploadedRows(): ParsedVoterRow[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

