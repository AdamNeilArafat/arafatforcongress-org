import React from 'react';
import { mergeScript } from '../../lib/scripts/merge';

export default function VolunteerTextsPage() {
  const merged = mergeScript('Hi {{first_name}}, can we count on your vote in {{city}}?', { first_name: 'Neighbor', city: 'Tacoma' });
  return (
    <main>
      <h1>Text Banking</h1>
      <p>{merged}</p>
      <button>Copy message</button>
      <button>Copy number</button>
    </main>
  );
}
