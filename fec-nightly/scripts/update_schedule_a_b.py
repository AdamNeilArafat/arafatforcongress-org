
import os, json, time, requests, pandas as pd
from pathlib import Path
from datetime import datetime

API = "https://api.open.fec.gov/v1"
KEY = os.environ.get("OPENFEC_API_KEY", "")

CYCLES = [2022, 2024, 2026]

# relative to subfolder
ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "data" / "raw" / "state_schedule_ab.json"
WARE = ROOT / "data" / "warehouse"

def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"schedule_a":{}, "schedule_b":{}}

def save_state(s): 
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s, indent=2))

def page(endpoint, params, last_indexes=None):
    p = params.copy()
    if last_indexes:
        p.update(last_indexes)
    p["api_key"] = KEY
    while True:
        r = requests.get(f"{API}{endpoint}", params=p, timeout=180)
        r.raise_for_status()
        js = r.json()
        yield js["results"]
        li = js.get("pagination", {}).get("last_indexes")
        if not li: break
        p.update(li)
        time.sleep(0.15)

def collect(table, cycle, min_date):
    endpoint = f"/schedules/{table}/"
    params = {
        "two_year_transaction_period": cycle,
        "min_date": min_date,
        "per_page": 100,
        "sort": "-disbursement_date" if table=="schedule_b" else "-contribution_receipt_date",
        "sort_hide_null": False
    }
    rows = []
    for chunk in page(endpoint, params, None):
        if not chunk: break
        rows.extend(chunk)
        if len(rows) >= 250_000:
            yield rows; rows=[]
    if rows:
        yield rows

def run_table(table, min_date_default="2021-01-01"):
    if not KEY:
        raise SystemExit("Missing OPENFEC_API_KEY in environment")
    s = load_state()
    tstate = s[table]
    for cycle in CYCLES:
        min_date = tstate.get(str(cycle), min_date_default)
        parts = []
        for rows in collect(table, cycle, min_date):
            df = pd.DataFrame(rows)
            if df.empty: 
                continue
            outdir = WARE / table / str(cycle)
            outdir.mkdir(parents=True, exist_ok=True)
            parts.append(df)
        if parts:
            df = pd.concat(parts, ignore_index=True)
            df.to_parquet(outdir / f"inc_{int(time.time())}.parquet", index=False)
            tstate[str(cycle)] = datetime.utcnow().strftime("%Y-%m-%d")
    s[table] = tstate
    save_state(s)

if __name__ == "__main__":
    run_table("schedule_a")
    run_table("schedule_b")
