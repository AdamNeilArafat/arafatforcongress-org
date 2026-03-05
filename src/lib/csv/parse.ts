import Papa from 'papaparse';
import { CsvRow, ValidationError, inferMappingForHeaders, normalizeRow, validateRow, type VoterField } from './schema';

export type ParseProgress = {
  processed: number;
  errors: ValidationError[];
  rows: Record<string, string>[];
  headers: string[];
  preview: CsvRow[];
};

export async function parseCsvText(
  csvText: string,
  onProgress?: (count: number) => void,
  mapping?: Record<string, VoterField>
): Promise<ParseProgress> {
  const errors: ValidationError[] = [];
  const rows: Record<string, string>[] = [];
  const preview: CsvRow[] = [];
  let processed = 0;
  let headers: string[] = [];
  let activeMapping: Record<string, VoterField> = mapping ?? {};

  Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    step: (result) => {
      if (processed === 0) {
        headers = Object.keys(result.data ?? {});
        if (!mapping) activeMapping = inferMappingForHeaders(headers);
      }
      processed += 1;
      onProgress?.(processed);
      if (preview.length < 100) preview.push(result.data);
      const normalized = normalizeRow(result.data, activeMapping);
      const rowErrors = validateRow(normalized, processed + 1);
      if (rowErrors.length) errors.push(...rowErrors);
      else rows.push(normalized);
    }
  });

  return { processed, errors, rows, headers, preview };
}
