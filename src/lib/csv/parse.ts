import Papa from 'papaparse';
import { CsvRow, ValidationError, normalizeRow, validateRow, waPreset } from './schema';

export type ParseProgress = { processed: number; errors: ValidationError[]; rows: Record<string, string>[] };

export async function parseCsvText(csvText: string, onProgress?: (count: number) => void): Promise<ParseProgress> {
  const errors: ValidationError[] = [];
  const rows: Record<string, string>[] = [];
  let processed = 0;

  Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    step: (result) => {
      processed += 1;
      onProgress?.(processed);
      const normalized = normalizeRow(result.data, waPreset);
      const rowErrors = validateRow(normalized, processed + 1);
      if (rowErrors.length) errors.push(...rowErrors);
      else rows.push(normalized);
    }
  });

  return { processed, errors, rows };
}
