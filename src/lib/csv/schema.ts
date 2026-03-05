export type VoterField =
  | 'external_voter_id'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'birth_year'
  | 'gender'
  | 'address'
  | 'address_line1'
  | 'regstnum'
  | 'regstfrac'
  | 'regstname'
  | 'regsttype'
  | 'regunittype'
  | 'regunitnum'
  | 'city'
  | 'state'
  | 'zip'
  | 'precinct'
  | 'legislative_district'
  | 'congressional_district'
  | 'latitude'
  | 'longitude'
  | 'phone'
  | 'email'
  | 'tags';

export type CsvRow = Record<string, string | undefined>;

export const waPreset: Record<string, VoterField> = {
  StateVoterID: 'external_voter_id',
  FName: 'first_name',
  MName: 'middle_name',
  LName: 'last_name',
  Birthyear: 'birth_year',
  Gender: 'gender',
  FullAddress: 'address',
  RegAddress: 'address',
  RegStNum: 'regstnum',
  RegStFrac: 'regstfrac',
  RegStName: 'regstname',
  RegStType: 'regsttype',
  RegUnitType: 'regunittype',
  RegUnitNum: 'regunitnum',
  RegCity: 'city',
  RegState: 'state',
  RegZipCode: 'zip',
  PrecinctCode: 'precinct',
  LegislativeDistrict: 'legislative_district',
  CongressionalDistrict: 'congressional_district',
  Latitude: 'latitude',
  Longitude: 'longitude',
  Phone: 'phone',
  Email: 'email',
  Tags: 'tags'
};

function normalizeHeader(header: string) {
  return String(header || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const headerAliases: Record<string, VoterField> = {
  firstname: 'first_name',
  lastname: 'last_name',
  middlename: 'middle_name',
  statevoterid: 'external_voter_id',
  voterid: 'external_voter_id',
  zipcode: 'zip',
  postalcode: 'zip',
  phonenumber: 'phone',
  emailaddress: 'email',
  addressline1: 'address_line1'
};

export function inferMappingForHeaders(headers: string[]): Record<string, VoterField> {
  const auto: Record<string, VoterField> = {};
  const byNormalizedHeader = new Map<string, VoterField>();

  for (const [sourceHeader, field] of Object.entries(waPreset)) {
    byNormalizedHeader.set(normalizeHeader(sourceHeader), field);
  }
  for (const field of Object.values(waPreset)) {
    byNormalizedHeader.set(normalizeHeader(field), field);
  }
  for (const [alias, field] of Object.entries(headerAliases)) {
    byNormalizedHeader.set(alias, field);
  }

  for (const header of headers) {
    const mapped = byNormalizedHeader.get(normalizeHeader(header));
    if (mapped) auto[header] = mapped;
  }

  return auto;
}

export type ValidationError = { line: number; problem: string };

export function normalizeRow(row: CsvRow, mapping: Record<string, VoterField>) {
  const normalized: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    const value = row[col]?.trim();
    if (value) normalized[field] = value;
  }

  if (!normalized.address && !normalized.address_line1) {
    const address = [row.RegStNum, row.RegStFrac, row.RegStName, row.RegStType, row.RegUnitType, row.RegUnitNum].filter(Boolean).join(' ').trim();
    if (address) normalized.address = address;
  }

  return normalized;
}

function isValidCoordinate(lat?: number, lng?: number) {
  if (lat == null || lng == null) return true;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function validateRow(row: Record<string, string>, line: number): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!row.first_name && !row.last_name) errors.push({ line, problem: 'Missing name fields' });
  if (!row.address && !row.address_line1 && !row.regstname) errors.push({ line, problem: 'Missing address' });

  if (row.birth_year && Number.isNaN(Number(row.birth_year))) {
    errors.push({ line, problem: 'Birth year must be numeric' });
  }

  const lat = row.latitude ? Number(row.latitude) : undefined;
  const lng = row.longitude ? Number(row.longitude) : undefined;
  if ((row.latitude && Number.isNaN(lat)) || (row.longitude && Number.isNaN(lng))) {
    errors.push({ line, problem: 'Coordinates must be numeric' });
  } else if (!isValidCoordinate(lat, lng)) {
    errors.push({ line, problem: 'Coordinates out of range' });
  }

  return errors;
}
