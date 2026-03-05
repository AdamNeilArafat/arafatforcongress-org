import { beforeEach, describe, expect, it } from 'vitest';
import { parseCsvText } from '../lib/csv/parse';
import { importRows, listVoters, resetDb } from '../lib/db/store';

class MemoryStorage {
  private db = new Map<string, string>();
  getItem(k: string) { return this.db.get(k) ?? null; }
  setItem(k: string, v: string) { this.db.set(k, v); }
  removeItem(k: string) { this.db.delete(k); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  resetDb();
});

describe('csv parse/validate/import', () => {
  it('parses and imports valid rows while counting invalid rows', async () => {
    const csv = `FName,LName,RegAddress,RegCity,RegState,RegZipCode,Phone,Latitude,Longitude\nA,One,123 Main,Tacoma,WA,98402,5551112222,47.25,-122.44\nB,Two,,Tacoma,WA,98402,5551113333,47.26,-122.45`;
    const parsed = await parseCsvText(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors.length).toBeGreaterThan(0);
    const batch = importRows('sample.csv', parsed.rows, parsed.errors.length);
    expect(batch.inserted_count).toBe(1);
    expect(batch.invalid_count).toBe(1);
  });

  it('dedupes across stacked files', async () => {
    const csv = `external_voter_id,first_name,last_name,address,city,state,zip\nX1,A,One,123 Main,Tacoma,WA,98402`;
    const parsed = await parseCsvText(csv, undefined, {
      external_voter_id: 'external_voter_id',
      first_name: 'first_name',
      last_name: 'last_name',
      address: 'address',
      city: 'city',
      state: 'state',
      zip: 'zip'
    } as any);
    importRows('a.csv', parsed.rows, 0);
    const second = importRows('b.csv', parsed.rows, 0);
    expect(second.duplicate_count).toBe(1);
    expect(listVoters()).toHaveLength(1);
  });
});
