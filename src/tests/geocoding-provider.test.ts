import { describe, expect, it } from 'vitest';
import { hashNormalizedAddress, normalizeAddressText } from '../lib/geocoding/address';

describe('address normalization', () => {
  it('normalizes and hashes address text consistently', () => {
    const a = normalizeAddressText(' 123 Main St, Tacoma, WA 98402 ');
    const b = normalizeAddressText('123   MAIN ST, Tacoma, wa 98402');
    expect(a).toBe(b);
    expect(hashNormalizedAddress(a)).toBe(hashNormalizedAddress(b));
  });
});
