import React from 'react';

type Props = { title: string; points: Array<{ id: string; label: string }> };

export function MapShell({ title, points }: Props) {
  return (
    <section>
      <h2>{title}</h2>
      <p>Map provider integration slot (Mapbox GL recommended).</p>
      <ul>
        {points.map((p) => (
          <li key={p.id}>{p.label}</li>
        ))}
      </ul>
    </section>
  );
}
