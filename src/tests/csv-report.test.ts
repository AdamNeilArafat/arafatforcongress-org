import { describe, expect, it } from 'vitest';
import { buildUploadReport } from '../lib/csv/report';

describe('buildUploadReport', () => {
  it('groups rows by normalized address and counts volunteer signals', () => {
    const report = buildUploadReport([
      { full_address: '123 Main St, Tacoma, WA 98402', interest: 'Volunteer' },
      { full_address: '123 MAIN ST, Tacoma, WA 98402', volunteer_interest: 'yes' },
      { full_address: '98 Pine Ave, Olympia, WA 98501', interest: 'No' }
    ]);

    expect(report.totalRecords).toBe(3);
    expect(report.totalAddresses).toBe(2);
    expect(report.volunteerTagged).toBe(2);
    expect(report.addressesNeedingFollowUp).toBe(1);
    expect(report.addressRows[0].address).toBe('123 Main St, Tacoma, WA 98402');
    expect(report.addressRows[0].residents).toBe(2);
  });
});

