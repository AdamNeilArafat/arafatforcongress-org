import { describe, expect, it } from 'vitest';
import { NominatimLocalProvider } from '../lib/geocoding/provider';

const runIf = process.env.RUN_NOMINATIM_INTEGRATION === '1' ? describe : describe.skip;

runIf('nominatim local integration', () => {
  it('geocodes using local nominatim when available', async () => {
    const provider = new NominatimLocalProvider(
      process.env.NOMINATIM_BASE_URL ?? 'http://localhost:8080',
      'us',
      'afc-dashboard-test/1.0 (local geocoder)',
      'en-US'
    );
    const result = await provider.geocode('1600 Pennsylvania Ave NW, Washington, DC 20500');
    expect(result.lat).toBeTypeOf('number');
    expect(result.lng).toBeTypeOf('number');
  });
});
