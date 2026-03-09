import React from 'react';
import { mergeScript } from '../../lib/scripts/merge';
import { listVoters, listTemplates, logOutreach } from '../../lib/db/store';

export default function VolunteerTextsPage() {
  const [idx, setIdx] = React.useState(0);
  const [template, setTemplate] = React.useState('Hi {{first_name}}, this is a volunteer for Arafat for Congress. Can we count on your vote in {{city}}?');
  const [lastAction, setLastAction] = React.useState('');
  const [copyStatus, setCopyStatus] = React.useState('');

  const voters = listVoters();
  const templates = listTemplates();
  const textable = voters.filter((v) => Boolean(v.phone) && !v.do_not_contact);

  const voter = textable[idx] ?? null;
  const progress = textable.length > 0 ? `${Math.min(idx + 1, textable.length)} of ${textable.length}` : '0';

  const merged = voter
    ? mergeScript(template, { first_name: voter.first_name ?? 'neighbor', city: voter.city ?? 'your area' })
    : '';

  function logAndAdvance(outcome: string) {
    if (!voter) return;
    logOutreach({ voter_id: voter.id, channel: 'text', outcome, metadata_json: { template_preview: merged } });
    setLastAction(`Logged "${outcome}" for ${voter.first_name ?? ''} ${voter.last_name ?? ''}`);
    setIdx((i) => i + 1);
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`Copied ${label}!`);
      setTimeout(() => setCopyStatus(''), 2000);
    } catch {
      setCopyStatus('Copy failed — please copy manually');
    }
  }

  return (
    <main>
      <h1>Text Banking</h1>

      {textable.length === 0 ? (
        <p>No textable records — upload a CSV with a <strong>phone</strong> column mapped in the admin dashboard.</p>
      ) : idx >= textable.length ? (
        <div>
          <p>All {textable.length} contacts have been texted. Great work!</p>
          <button onClick={() => { setIdx(0); setLastAction(''); }}>Start over</button>
        </div>
      ) : (
        <>
          <p style={{ color: '#555' }}>Contact {progress}</p>

          <div style={{ marginBottom: 12 }}>
            <label>Message template: </label>
            {templates.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) setTemplate(e.target.value); }}
                style={{ marginLeft: 8 }}
              >
                <option value="">Load saved template…</option>
                {templates.map((t) => <option key={t.id} value={t.body}>{t.name}</option>)}
              </select>
            )}
            <br />
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={3}
              style={{ width: '100%', maxWidth: 480, marginTop: 4 }}
              placeholder="Use {{first_name}} and {{city}} as placeholders"
            />
          </div>

          <div style={{ border: '1px solid #ccc', padding: 16, borderRadius: 6, maxWidth: 480 }}>
            <h2 style={{ margin: '0 0 4px' }}>{voter.first_name ?? ''} {voter.last_name ?? ''}</h2>
            <p style={{ margin: '0 0 8px', color: '#555' }}>{[voter.address_line1, voter.city, voter.state].filter(Boolean).join(', ')}</p>
            <p style={{ margin: 0 }}>
              <strong>Number:</strong>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 16 }}>{voter.phone}</span>
              <button onClick={() => copyText(voter.phone!, 'number')} style={{ marginLeft: 8 }}>Copy number</button>
            </p>
          </div>

          <div style={{ border: '1px solid #ddd', background: '#f9f9f9', padding: 12, borderRadius: 6, maxWidth: 480, marginTop: 12 }}>
            <strong>Preview message:</strong>
            <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{merged}</p>
            <button onClick={() => copyText(merged, 'message')} style={{ marginTop: 8 }}>Copy message</button>
          </div>

          {copyStatus && <p style={{ color: 'green', marginTop: 4 }}>{copyStatus}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={() => logAndAdvance('sent')}>Mark Sent — Next</button>
            <button onClick={() => logAndAdvance('no_response')}>No Response — Next</button>
            <button onClick={() => logAndAdvance('opted_out')}>Opted Out — Next</button>
            <button onClick={() => setIdx((i) => i + 1)} style={{ color: '#888' }}>Skip (no log)</button>
          </div>

          {lastAction && <p style={{ color: 'green', marginTop: 8 }}>{lastAction}</p>}
        </>
      )}
    </main>
  );
}
