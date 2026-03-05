import { beforeEach, describe, expect, it } from 'vitest';
import { parseCsvText } from '../lib/csv/parse';
import { geocodeHouseholdsBatch } from '../jobs/geocodeHouseholds';
import { clearAll, importRows, listGeocodeJobs, listVoters, resetDb } from '../lib/db/store';

class MemoryStorage {
  private db = new Map<string, string>();
  getItem(k: string) { return this.db.get(k) ?? null; }
  setItem(k: string, v: string) { this.db.set(k, v); }
  removeItem(k: string) { this.db.delete(k); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
  (process as any).env.GEOCODER_PROVIDER = 'mock';
  resetDb();
});

describe('csv parse/validate/import + geocoding', () => {
  it('imports rows and assigns geocode statuses', async () => {
    const csv = `FName,LName,RegAddress,RegCity,RegState,RegZipCode,Phone,Latitude,Longitude\nA,One,123 Main,Tacoma,WA,98402,5551112222,47.25,-122.44\nB,Two,300 Pine,Tacoma,WA,98403,5551113333,,\nC,Three,500 Elm,,WA,,5551113334,,`;
    const parsed = await parseCsvText(csv);
    const batch = importRows('sample.csv', parsed.rows, parsed.errors.length);
    expect(batch.inserted_count).toBe(3);
    expect(batch.pinnable_count).toBe(1);
    expect(batch.geocode_queued_count).toBe(1);
    expect(batch.blocked_count).toBe(1);

    const voters = listVoters();
    expect(voters.find((v) => v.last_name === 'One')?.geocode_status).toBe('not_needed');
    expect(voters.find((v) => v.last_name === 'Two')?.geocode_status).toBe('pending');
    expect(voters.find((v) => v.last_name === 'Three')?.geocode_status).toBe('blocked_missing_fields');
  });

  it('stacks imports and dedupes across files', async () => {
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

  it('processes queued jobs and writes lat/lng to voters', async () => {
    const csv = `FName,LName,RegAddress,RegCity,RegState,RegZipCode\nB,Two,300 Pine,Tacoma,WA,98403`;
    const parsed = await parseCsvText(csv);
    importRows('sample.csv', parsed.rows, parsed.errors.length);
    expect(listGeocodeJobs()).toHaveLength(1);

    const result = await geocodeHouseholdsBatch(10);
    expect(result.geocoded).toBe(1);

    const voter = listVoters()[0];
    expect(voter.latitude).toBeTypeOf('number');
    expect(voter.longitude).toBeTypeOf('number');
    expect(voter.geocode_status).toBe('success');
  });

  it('clear all soft deletes voters and removes map-visible rows', async () => {
    const csv = `FName,LName,RegAddress,RegCity,RegState,RegZipCode,Latitude,Longitude\nA,One,123 Main,Tacoma,WA,98402,47.25,-122.44`;
    const parsed = await parseCsvText(csv);
    importRows('sample.csv', parsed.rows, parsed.errors.length);
    expect(listVoters().length).toBe(1);
    clearAll();
    expect(listVoters().length).toBe(0);
  });
});
