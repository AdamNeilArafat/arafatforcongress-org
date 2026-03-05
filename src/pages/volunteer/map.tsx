import React from 'react';
import { MapShell } from '../../components/Map/MapShell';

export default function VolunteerMapPage() {
  return <MapShell title="My Assigned Turf" points={[{ id: '1', label: 'Example household' }]} />;
}
