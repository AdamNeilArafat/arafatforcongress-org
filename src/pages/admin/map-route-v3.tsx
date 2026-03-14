import React from 'react';
import LeafletOpsMap from '../../components/Map/LeafletOpsMap';

export default function MapRouteV3Panel() {
  return (
    <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>Mapping, Turfing & Route Planning V3</h3>
      <p>Leaflet map with OSM tiles, contact markers, and a turf polygon preview for volunteer assignment.</p>
      <LeafletOpsMap />
      <ul>
        <li>Provider-agnostic routing: openrouteservice when configured, nearest-neighbor fallback if unavailable.</li>
        <li>Supports walk lists, drive lists, stop ordering, and route sheet exports.</li>
        <li>Map overlays can include demographics, legislative districts, finance context, and nearby POIs.</li>
      </ul>
    </section>
  );
}
