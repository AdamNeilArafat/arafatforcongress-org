export type VoterField =
  | 'external_voter_id'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'birth_year'
  | 'gender'
  | 'address'
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

export type ValidationError = { line: number; problem: string };

export function normalizeRow(row: CsvRow, mapping: Record<string, VoterField>) {
  const normalized: Record<string, string> = {};
  for (const [col, field] of Object.entries(mapping)) {
    const value = row[col]?.trim();
    if (value) normalized[field] = value;
  }

  if (!normalized.address) {
    const address = [row.RegStNum, row.RegStName, row.RegStType].filter(Boolean).join(' ').trim();
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
  if (!row.address) errors.push({ line, problem: 'Missing address' });
  if (!row.city) errors.push({ line, problem: 'Missing city' });

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
