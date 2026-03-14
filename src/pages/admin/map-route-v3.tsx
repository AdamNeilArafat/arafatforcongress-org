import React from 'react';

export default function MapRouteV3Panel() {
  return (
    <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
      <h3>Mapping & Route Planning V3</h3>
      <ul>
        <li>Marker clusters and heatmap layers by tag/status/tract.</li>
        <li>Turf polygons for assignment to volunteers.</li>
        <li>Provider-agnostic routes with nearest-neighbor fallback when external routing is unavailable.</li>
      </ul>
    </section>
  );
}
