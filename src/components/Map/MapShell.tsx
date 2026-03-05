import React from 'react';

type Props = { title: string; points: Array<{ id: string; label: string }>; pending: number; blocked: number; failed: number };

export function MapShell({ title, points, pending, blocked, failed }: Props) {
  return (
    <section>
      <h2>{title}</h2>
      <p>Map provider integration slot (Mapbox GL recommended).</p>
      <p>Pins: {points.length} | Pending geocode: {pending} | Blocked (missing city/zip): {blocked} | Failed: {failed}</p>
      {points.length === 0 ? <p>No mappable voters yet. Check pending/blocked/failed counts above.</p> : null}
      <ul>
        {points.map((p) => (
          <li key={p.id}>{p.label}</li>
        ))}
      </ul>
    </section>
  );
}
