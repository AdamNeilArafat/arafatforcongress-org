
import os, sys, time, zipfile, requests
from datetime import datetime
from pathlib import Path

# Two-year cycles that cover 2021 onward
CYCLES = ["2022","2024","2026"]  # 2021–22, 2023–24, 2025–26
BASE = "https://www.fec.gov/files/bulk-downloads"

TEMPLATES = {
  "candidate_master":      [f"{BASE}/{{cycle}}/cn{{yy}}.zip"],
  "committee_master":      [f"{BASE}/{{cycle}}/cm{{yy}}.zip"],
  "candidate_comm_links":  [f"{BASE}/{{cycle}}/ccl{{yy}}.zip"],
  "hs_current_campaigns":  [f"{BASE}/{{cycle}}/webl{{yy}}.zip"],
  "committee_itemized_oth":[f"{BASE}/{{cycle}}/oth{{yy}}.zip"],
  "operating_expenditures":[f"{BASE}/{{cycle}}/oppexp{{yy}}.zip"],
  "candidate_summary":     [f"{BASE}/{{cycle}}/candidate_summary_{{cycle}}.csv"],
  "committee_summary":     [f"{BASE}/{{cycle}}/committee_summary_{{cycle}}.csv"],
  "independent_expenditure":[f"{BASE}/{{cycle}}/independent_expenditure_{{cycle}}.csv"],
  "electioneering":        [f"{BASE}/{{cycle}}/ElectioneeringComm_{{cycle}}.csv"],
  "communication_costs":   [f"{BASE}/{{cycle}}/CommunicationCosts_{{cycle}}.csv"],
}

SINGLES = {
  "lobbyist_bundle": "https://www.fec.gov/files/bulk-downloads/data.fec.gov/lobbyist_bundle.csv"
}

def fetch(url: str, out_path: Path) -> bool:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        r = requests.get(url, timeout=180)
        if r.status_code != 200:
            print(f"[skip] {url} [{r.status_code}]", file=sys.stderr)
            return False
        out_path.write_bytes(r.content)
        print(f"[ok] {out_path}")
        return True
    except Exception as e:
        print(f"[err] {url} -> {e}", file=sys.stderr)
        return False

def maybe_unzip(path: Path, outdir: Path):
    if path.suffix.lower() == ".zip" and path.exists():
        try:
            with zipfile.ZipFile(path) as z:
                z.extractall(outdir)
            path.unlink(missing_ok=True)
        except Exception as e:
            print(f"[unzip err] {path}: {e}", file=sys.stderr)

def main():
    stamp = datetime.utcnow().strftime("%Y%m%d")
    # note: relative to subfolder
    base_out = Path(__file__).resolve().parents[1] / "data" / "raw" / stamp
    for cycle in CYCLES:
        yy = cycle[-2:]
        for name, urls in TEMPLATES.items():
            for t in urls:
                url = t.format(cycle=cycle, yy=yy)
                out = base_out / name / os.path.basename(url)
                ok = fetch(url, out)
                if ok: maybe_unzip(out, base_out / name)
                time.sleep(0.2)
    for name, url in SINGLES.items():
        out = base_out / name / os.path.basename(url)
        fetch(url, out)

if __name__ == "__main__":
    main()
