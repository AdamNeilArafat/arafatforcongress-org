import React from 'react';

type CallPanelProps = {
  voterName: string;
  phone?: string;
  script: string;
  onLogOutcome: (resultCode: string, notes: string) => void;
};

export function CallPanel({ voterName, phone, script, onLogOutcome }: CallPanelProps) {
  return (
    <div>
      <h3>Call: {voterName}</h3>
      <p>{script}</p>
      {phone ? <a href={`tel:${phone}`}>Call {phone}</a> : <p>No phone available</p>}
      <button onClick={() => onLogOutcome('no_answer', '')}>Log no answer</button>
      <button onClick={() => onLogOutcome('spoke_support', 'Positive response')}>Log support</button>
    </div>
  );
}
