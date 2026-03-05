import React from 'react';
import { CallPanel } from '../../components/CallPanel';
import { listVoters } from '../../lib/db/store';

export default function VolunteerCallsPage() {
  const voters = listVoters();
  const callable = voters.filter((v) => Boolean(v.phone));
  const first = callable[0];

  return (
    <main>
      <h1>Phone Banking</h1>
      {callable.length === 0 ? <p>0 callable/textable because no phone field was provided.</p> : null}
      {first ? <CallPanel voterName={`${first.first_name ?? ''} ${first.last_name ?? ''}`.trim()} phone={first.phone} script="Hi {{first_name}}, this is Arafat for Congress..." onLogOutcome={() => undefined} /> : null}
    </main>
  );
}
