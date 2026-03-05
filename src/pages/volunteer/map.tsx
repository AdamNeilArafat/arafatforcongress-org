import React from 'react';
import { MapShell } from '../../components/Map/MapShell';
import { listVoters } from '../../lib/db/store';

export default function VolunteerMapPage() {
  const voters = listVoters();
  const points = voters.filter((v) => v.latitude != null && v.longitude != null).map((v) => ({ id: v.id, label: `${v.first_name ?? ''} ${v.last_name ?? ''}`.trim() || 'Household' }));
  const pending = voters.filter((v) => v.geocode_status === 'pending').length;
  const blocked = voters.filter((v) => v.geocode_status === 'blocked_missing_fields').length;
  const failed = voters.filter((v) => v.geocode_status === 'failed').length;

  return <MapShell title="My Assigned Turf" points={points} pending={pending} blocked={blocked} failed={failed} />;
}
