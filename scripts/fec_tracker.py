#!/usr/bin/env python3
"""
Arafat for Congress — FEC Financial Tracker
Queries the OpenFEC API for committee C00914705 and writes
aggregate financial totals to data/fec_financials.json.

USAGE:
    pip install requests
    python3 scripts/fec_tracker.py

ENVIRONMENT VARIABLES:
    FEC_API_KEY     — Your OpenFEC API key (get one free at api.open.fec.gov)
                      Falls back to the public DEMO_KEY (rate-limited: 1000/day).

OUTPUT:
    data/fec_financials.json — Totals and a "Stale Data" warning if sync fails.

SCHEDULE:
    Add to cron or call from a GitHub Actions workflow.
    Recommended: daily at 8am Pacific.
"""

import os
import json
import sys
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

# ─── CONFIG ────────────────────────────────────────────────────────────────────
COMMITTEE_ID  = 'C00914705'
API_BASE      = 'https://api.open.fec.gov/v1'
API_KEY       = os.environ.get('FEC_API_KEY', 'DEMO_KEY')
OUTPUT_FILE   = os.path.join(os.path.dirname(__file__), '..', 'data', 'fec_financials.json')
TIMEOUT_SECS  = 20
# ──────────────────────────────────────────────────────────────────────────────


def fec_get(endpoint: str, params: dict) -> dict:
    """Make a GET request to the OpenFEC API and return parsed JSON."""
    params['api_key'] = API_KEY
    url = f"{API_BASE}/{endpoint}?{urlencode(params)}"
    req = Request(url, headers={'Accept': 'application/json'})
    try:
        with urlopen(req, timeout=TIMEOUT_SECS) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except HTTPError as e:
        raise RuntimeError(f"FEC API HTTP error {e.code}: {e.reason}") from e
    except URLError as e:
        raise RuntimeError(f"FEC API connection error: {e.reason}") from e


def fetch_committee() -> dict:
    """Fetch committee profile for COMMITTEE_ID."""
    data = fec_get('committee/' + COMMITTEE_ID, {})
    result = data.get('result', {})
    return {
        'name':         result.get('name', ''),
        'state':        result.get('state', ''),
        'party':        result.get('party_full', ''),
        'type':         result.get('committee_type_full', ''),
        'designation':  result.get('designation_full', ''),
        'first_file':   result.get('first_file_date', ''),
    }


def fetch_totals() -> dict:
    """Fetch financial totals (all cycles) for the committee."""
    data = fec_get('committee/' + COMMITTEE_ID + '/totals', {
        'sort': '-cycle',
        'per_page': 5,
    })
    results = data.get('results', [])
    if not results:
        return {}

    latest = results[0]
    return {
        'cycle':                    latest.get('cycle'),
        'total_receipts':           latest.get('receipts', 0),
        'total_disbursements':      latest.get('disbursements', 0),
        'total_individual_itemized': latest.get('individual_itemized_contributions', 0),
        'total_individual_unitemized': latest.get('individual_unitemized_contributions', 0),
        'cash_on_hand_end':         latest.get('last_cash_on_hand_end_period', 0),
        'debts_owed':               latest.get('last_debts_owed_by_committee', 0),
        'coverage_start':           latest.get('coverage_start_date', ''),
        'coverage_end':             latest.get('coverage_end_date', ''),
    }


def fetch_recent_filings(n: int = 5) -> list:
    """Fetch the N most recent filings for the committee."""
    data = fec_get('filings', {
        'committee_id': COMMITTEE_ID,
        'sort':         '-receipt_date',
        'per_page':     n,
    })
    filings = []
    for f in data.get('results', []):
        filings.append({
            'form_type':    f.get('form_type', ''),
            'receipt_date': f.get('receipt_date', ''),
            'description':  f.get('document_description', ''),
            'report_year':  f.get('report_year', ''),
        })
    return filings


def load_existing() -> dict:
    """Load existing output file if present."""
    try:
        with open(OUTPUT_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_output(data: dict):
    """Write data dict to OUTPUT_FILE."""
    os.makedirs(os.path.dirname(os.path.abspath(OUTPUT_FILE)), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data, f, indent=2)


def main():
    now_utc = datetime.now(timezone.utc).isoformat()
    print(f"[{now_utc}] Querying OpenFEC API for committee {COMMITTEE_ID}…")

    try:
        committee = fetch_committee()
        totals    = fetch_totals()
        filings   = fetch_recent_filings(5)

        output = {
            'committee_id':   COMMITTEE_ID,
            'committee':      committee,
            'financial_totals': totals,
            'recent_filings': filings,
            'data_pull_date': now_utc,
            'stale':          False,
            'stale_reason':   None,
            'disclaimer':     (
                'Paid for by Arafat for Congress. '
                'Financial data sourced from FEC public records via OpenFEC API. '
                'Contributions or gifts to Arafat for Congress are not tax-deductible.'
            ),
        }
        write_output(output)
        print(f"  Committee : {committee.get('name', 'N/A')}")
        print(f"  Cycle     : {totals.get('cycle', 'N/A')}")
        print(f"  Receipts  : ${totals.get('total_receipts', 0):,.2f}")
        print(f"  Cash on Hand: ${totals.get('cash_on_hand_end', 0):,.2f}")
        print(f"  Recent filings: {len(filings)}")
        print(f"SUCCESS — wrote {OUTPUT_FILE}")

    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        # Write stale data warning so the site knows data is outdated
        existing = load_existing()
        existing['stale']        = True
        existing['stale_reason'] = str(e)
        existing['data_pull_date'] = now_utc
        write_output(existing)
        print("Stale data warning written to output file.", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
