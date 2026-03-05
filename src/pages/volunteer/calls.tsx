import React from 'react';
import { CallPanel } from '../../components/CallPanel';

export default function VolunteerCallsPage() {
  return (
    <main>
      <h1>Phone Banking</h1>
      <CallPanel voterName="Sample Voter" phone="+12535550123" script="Hi {{first_name}}, this is Arafat for Congress..." onLogOutcome={() => undefined} />
    </main>
  );
}
