export type ParsedVoterRow = Record<string, string>;

export type AddressReportRow = {
  address: string;
  residents: number;
  volunteers: number;
};

export type UploadReport = {
  totalRecords: number;
  totalAddresses: number;
  volunteerTagged: number;
  addressesNeedingFollowUp: number;
  addressRows: AddressReportRow[];
};

function normalizeAddress(value?: string) {
  return value?.trim().toLowerCase() ?? '';
}

export function buildUploadReport(rows: ParsedVoterRow[]): UploadReport {
  const grouped = new Map<string, AddressReportRow>();

  for (const row of rows) {
    const address = row.full_address?.trim();
    if (!address) continue;

    const key = normalizeAddress(address);
    const current = grouped.get(key) ?? { address, residents: 0, volunteers: 0 };
    current.residents += 1;

    const volunteerSignal = `${row.interest ?? ''} ${row.volunteer_interest ?? ''}`.toLowerCase();
    if (volunteerSignal.includes('volunteer') || volunteerSignal.includes('yes')) {
      current.volunteers += 1;
    }

    grouped.set(key, current);
  }

  const addressRows = Array.from(grouped.values()).sort((a, b) => b.residents - a.residents);
  const volunteerTagged = rows.filter((row) => {
    const volunteerSignal = `${row.interest ?? ''} ${row.volunteer_interest ?? ''}`.toLowerCase();
    return volunteerSignal.includes('volunteer') || volunteerSignal.includes('yes');
  }).length;

  return {
    totalRecords: rows.length,
    totalAddresses: addressRows.length,
    volunteerTagged,
    addressesNeedingFollowUp: addressRows.filter((row) => row.volunteers === 0).length,
    addressRows
  };
}

