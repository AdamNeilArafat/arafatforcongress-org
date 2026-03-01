#!/usr/bin/env python3
"""
Arafat for Congress — Local Sheet Sync
Run this from the repo root to pull live Google Sheet data and
write data/outreach_data.json + data/volunteer_data.json.

Usage:
    python3 scripts/sync-sheets.py

Then commit and push the updated data files:
    git add data/outreach_data.json data/volunteer_data.json
    git commit -m "chore: sync sheet data"
    git push
"""

import csv, json, re, sys, os
from datetime import datetime, timezone
from urllib.request import urlopen
from urllib.error import URLError

# ── URLs ──────────────────────────────────────────────────────────────────────
OUTREACH_URL = (
    'https://docs.google.com/spreadsheets/d/'
    '1waU1ZDIKlGgkTCDwMThsDZsWMR0PJpzyhYImGPCWzeY'
    '/export?format=csv&gid=1573758032'
)
VOLUNTEER_URL = (
    'https://docs.google.com/spreadsheets/d/'
    '1HbROvg-NwAgsplDhmyUA-7l5ip0iCMhf'
    '/export?format=csv&gid=1943968351'
)
OUT_OUTREACH  = 'data/outreach_data.json'
OUT_VOLUNTEER = 'data/volunteer_data.json'

# ── PII scrubbing ─────────────────────────────────────────────────────────────
PII_PATTERNS = [
    (r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', '[email redacted]'),
    (r'(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})',            '[phone redacted]'),
    (r'\b\d{3}-\d{2}-\d{4}\b',                              '[id redacted]'),
    (r'\b\d{5}(-\d{4})?\b',                                  '[zip redacted]'),
]

def scrub(text):
    if not text:
        return ''
    for pattern, replacement in PII_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text

def safe_key(raw):
    return (raw.strip().lower()
            .replace(' ', '_').replace('/', '_')
            .replace('?', '').replace('-', '_'))

def fetch_csv(url, label):
    print(f'  Fetching {label}...', end=' ', flush=True)
    try:
        with urlopen(url, timeout=30) as r:
            content = r.read().decode('utf-8')
        lines = content.splitlines()
        if not lines or lines[0].strip().startswith('<'):
            print('ERROR: got HTML instead of CSV (sheet may be private)')
            return []
        rows = list(csv.DictReader(lines))
        print(f'{len(rows)} rows')
        return rows
    except URLError as e:
        print(f'FAILED: {e}')
        return []

# ── Outreach sheet ─────────────────────────────────────────────────────────────
print('\n=== Outreach tab ===')
OUTREACH_PII = {'email','phone','first_name','last_name','name','full_address','address','contact_id'}
outreach_rows = fetch_csv(OUTREACH_URL, 'Outreach tab')

records = []
response_counts = {}
vol_interest_count = 0

for row in outreach_rows:
    clean = {}
    for k, v in row.items():
        sk = safe_key(k)
        if sk in OUTREACH_PII:
            continue
        clean[sk] = scrub(str(v).strip())
    if any(clean.values()):
        records.append(clean)
    resp = (row.get('Response') or '').strip()
    if resp:
        response_counts[resp] = response_counts.get(resp, 0) + 1
    vol_int = (row.get('Volunteer Interest?') or '').strip().lower()
    if vol_int in ('yes', 'y', 'true', '1'):
        vol_interest_count += 1

outreach_out = {
    'meta': {
        'total_records': len(records),
        'volunteer_interest_count': vol_interest_count,
        'response_breakdown': response_counts,
        'data_pull_date': datetime.now(timezone.utc).isoformat(),
        'stale': False,
    },
    'records': records,
}
os.makedirs('data', exist_ok=True)
with open(OUT_OUTREACH, 'w') as f:
    json.dump(outreach_out, f, indent=2)
print(f'  → Wrote {len(records)} records to {OUT_OUTREACH}')
print(f'  → Volunteer interest: {vol_interest_count}')
print(f'  → Responses: {response_counts}')

# ── Volunteer sheet ────────────────────────────────────────────────────────────
print('\n=== Volunteer sheet ===')
VOL_PII = {'email','phone','first_name','last_name','volunteer_id'}
vol_rows = fetch_csv(VOLUNTEER_URL, 'Volunteer sheet')

vol_records = []
active_count = 0
skill_counts = {}

for row in vol_rows:
    clean = {}
    for k, v in row.items():
        sk = safe_key(k)
        if sk in VOL_PII:
            continue
        clean[sk] = scrub(str(v).strip())
    if any(clean.values()):
        vol_records.append(clean)
    if (row.get('Status') or '').strip().lower() == 'active':
        active_count += 1
    skill = (row.get('Skills') or '').strip()
    if skill:
        skill_counts[skill] = skill_counts.get(skill, 0) + 1

vol_out = {
    'meta': {
        'total_volunteers': len(vol_records),
        'active_volunteers': active_count,
        'skills_breakdown': skill_counts,
        'data_pull_date': datetime.now(timezone.utc).isoformat(),
        'stale': len(vol_records) == 0 and len(vol_rows) == 0,
    },
    'records': vol_records,
}
with open(OUT_VOLUNTEER, 'w') as f:
    json.dump(vol_out, f, indent=2)
print(f'  → Wrote {len(vol_records)} records to {OUT_VOLUNTEER}')
print(f'  → Active volunteers: {active_count}')

print('\nDone. Now run:')
print('  git add data/outreach_data.json data/volunteer_data.json')
print('  git commit -m "chore: sync sheet data"')
print('  git push')
