import React from 'react';
import { listVoters, logOutreach } from '../../lib/db/store';

export default function VolunteerCallsPage() {
  const [idx, setIdx] = React.useState(0);
  const [notes, setNotes] = React.useState('');
  const [lastAction, setLastAction] = React.useState('');

  const voters = listVoters();
  const callable = voters.filter((v) => Boolean(v.phone) && !v.do_not_contact);

  const voter = callable[idx] ?? null;
  const progress = callable.length > 0 ? `${Math.min(idx + 1, callable.length)} of ${callable.length}` : '0';

  function logAndAdvance(outcome: string) {
    if (!voter) return;
    logOutreach({ voter_id: voter.id, channel: 'phone', outcome, notes: notes.trim() || undefined });
    setLastAction(`Logged "${outcome}" for ${voter.first_name ?? ''} ${voter.last_name ?? ''}`);
    setNotes('');
    setIdx((i) => i + 1);
  }

  return (
    <main>
      <h1>Phone Banking</h1>

      {callable.length === 0 ? (
        <p>No callable records — upload a CSV with a <strong>phone</strong> column mapped in the admin dashboard.</p>
      ) : idx >= callable.length ? (
        <div>
          <p>All {callable.length} contacts have been called. Great work!</p>
          <button onClick={() => { setIdx(0); setLastAction(''); }}>Start over</button>
        </div>
      ) : (
        <>
          <p style={{ color: '#555' }}>Contact {progress}</p>

          <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 6, maxWidth: 480 }}>
            <h2 style={{ margin: '0 0 4px' }}>{voter.first_name ?? ''} {voter.last_name ?? ''}</h2>
            <p style={{ margin: '0 0 8px', color: '#555' }}>{[voter.address_line1, voter.city, voter.state].filter(Boolean).join(', ')}</p>
            <a href={`tel:${voter.phone}`} style={{ fontSize: 20, fontWeight: 'bold' }}>{voter.phone}</a>
          </div>

          <div style={{ marginTop: 12 }}>
            <p style={{ fontStyle: 'italic', color: '#333' }}>
              "Hi {voter.first_name ?? 'there'}, my name is a volunteer with Arafat for Congress. We're reaching out to voters in {voter.city ?? 'your area'}. Can we count on your support?"
            </p>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>Notes (optional): </label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. strong supporter, call back Thursday" style={{ width: 320 }} />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={() => logAndAdvance('talked')}>Talked — Next</button>
            <button onClick={() => logAndAdvance('no_answer')}>No Answer — Next</button>
            <button onClick={() => logAndAdvance('left_voicemail')}>Left Voicemail — Next</button>
            <button onClick={() => logAndAdvance('refused')}>Refused — Next</button>
            <button onClick={() => logAndAdvance('wrong_number')}>Wrong Number — Next</button>
            <button onClick={() => setIdx((i) => i + 1)} style={{ color: '#888' }}>Skip (no log)</button>
          </div>

          {lastAction && <p style={{ color: 'green', marginTop: 8 }}>{lastAction}</p>}
        </>
      )}
    </main>
  );
}
