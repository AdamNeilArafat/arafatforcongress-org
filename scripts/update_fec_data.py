import csv, os, requests

FEC_API_KEY = os.environ["FEC_API_KEY"]
CANDIDATE_ID = os.environ["CANDIDATE_ID"]  # e.g., H0WA...  (lookup on fec.gov/data)
BASE = "https://api.open.fec.gov/v1"

def get_totals(cycle):
    # Candidate totals endpoint (receipts by source)
    url = f"{BASE}/candidate/totals/?api_key={FEC_API_KEY}&candidate_id={CANDIDATE_ID}&cycle={cycle}"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    results = r.json().get("results", [])
    return results[0] if results else {}

def safe(v): 
    return 0 if v in (None, "") else v

def main():
    cycles = [2024]  # extend if you want multiple cycles
    rows = []

    for c in cycles:
        t = get_totals(c)
        # FEC fields: https://api.open.fec.gov/developers/
        pac_total = safe(t.get("pac_contributions"))
        indiv_total = safe(t.get("individual_contributions"))
        total_receipts = safe(t.get("receipts"))
        pac_pct = round((pac_total / total_receipts) * 100, 2) if total_receipts else 0

        rows.append({
            "Topic":"Incumbent PAC share",
            "Amount": str(int(round(pac_total))),
            "Percent": str(pac_pct),
            "Cycle/Years": str(c),
            "Notes": f"PAC share of total receipts; individuals ≈ {int(round(indiv_total))}",
            "Source": f"{BASE}/candidate/totals/?candidate_id={CANDIDATE_ID}&cycle={c}"
        })

    # Keep your static head-tax and career figures too (until you want to compute everything via API)
    rows_static = [
        {
            "Topic":"Seattle head tax expected revenue",
            "Amount":"50000000",
            "Percent":"",
            "Cycle/Years":"2018",
            "Notes":"$275 per employee; repealed after pressure from Amazon/business groups",
            "Source":"https://www.axios.com/2018/06/12/seattle-repeals-homelessness-tax-amazon-big-tech-hq2"
        }
    ]

    outdir = "assets/data"
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, "strickland_funding.csv")

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Topic","Amount","Percent","Cycle/Years","Notes","Source"])
        writer.writeheader()
        for r in rows_static + rows:
            writer.writerow(r)

if __name__ == "__main__":
    main()
