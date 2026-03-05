import React from 'react';
import { mergeScript } from '../../lib/scripts/merge';
import { listVoters } from '../../lib/db/store';

export default function VolunteerTextsPage() {
  const voters = listVoters();
  const textable = voters.filter((v) => Boolean(v.phone));
  const first = textable[0];
  const merged = mergeScript('Hi {{first_name}}, can we count on your vote in {{city}}?', { first_name: first?.first_name ?? 'Neighbor', city: first?.city ?? 'your area' });

  return (
    <main>
      <h1>Text Banking</h1>
      {textable.length === 0 ? <p>0 callable/textable because no phone field was provided.</p> : null}
      <p>{merged}</p>
      <button>Copy message</button>
      <button disabled={!first?.phone}>Copy number</button>
    </main>
  );
}
