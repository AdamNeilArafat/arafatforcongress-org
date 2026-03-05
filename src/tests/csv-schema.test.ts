import { describe, expect, it } from 'vitest';
import { normalizeRow, validateRow, waPreset } from '../lib/csv/schema';

describe('csv schema validation', () => {
  it('normalizes WA row and validates success', () => {
    const row = normalizeRow(
      {
        FName: 'Sam',
        LName: 'Lee',
        RegStNum: '123',
        RegStName: 'Main',
        RegStType: 'St',
        RegCity: 'Tacoma',
        RegState: 'WA',
        RegZipCode: '98402'
      },
      waPreset
    );
    expect(validateRow(row, 2)).toEqual([]);
  });

  it('returns errors for missing minimums', () => {
    const errors = validateRow({}, 5);
    expect(errors.length).toBeGreaterThan(0);
  });
});
