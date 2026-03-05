export type VoterField =
  | 'state_voter_id'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'birth_year'
  | 'gender'
  | 'address_number'
  | 'address_street'
  | 'address_type'
  | 'city'
  | 'state'
  | 'zip'
  | 'precinct_code'
  | 'legislative_district'
  | 'congressional_district';

export type CsvRow = Record<string, string | undefined>;

export const waPreset: Record<string, VoterField> = {
  StateVoterID: 'state_voter_id',
  FName: 'first_name',
  MName: 'middle_name',
  LName: 'last_name',
  Birthyear: 'birth_year',
  Gender: 'gender',
  RegStNum: 'address_number',
  RegStName: 'address_street',
  RegStType: 'address_type',
  RegCity: 'city',
  RegState: 'state',
  RegZipCode: 'zip',
  PrecinctCode: 'precinct_code',
  LegislativeDistrict: 'legislative_district',
  CongressionalDistrict: 'congressional_district'
};

export type ValidationError = { line: number; problem: string };

export function normalizeRow(row: CsvRow, mapping: Record<string, VoterField>) {
  const normalized: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    const value = row[col]?.trim();
    if (value) normalized[field] = value;
  }
  const fullAddress = [normalized.address_number, normalized.address_street, normalized.address_type]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fullAddress) normalized.full_address = `${fullAddress}, ${normalized.city ?? ''}, ${normalized.state ?? ''} ${normalized.zip ?? ''}`.trim();
  return normalized;
}

export function validateRow(row: Record<string, string>, line: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.first_name && !row.last_name) errors.push({ line, problem: 'Missing name fields' });
  if (!row.full_address) errors.push({ line, problem: 'Missing full address' });
  if (row.birth_year && Number.isNaN(Number(row.birth_year))) {
    errors.push({ line, problem: 'Birth year must be numeric' });
  }
  return errors;
}
