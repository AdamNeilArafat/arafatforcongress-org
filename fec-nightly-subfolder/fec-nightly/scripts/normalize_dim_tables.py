import datetime, glob
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
WARE = ROOT / "data" / "warehouse"

# Ensure warehouse is a directory
if WARE.exists() and not WARE.is_dir():
    WARE.unlink()
WARE.mkdir(parents=True, exist_ok=True)

# Add current election cycle (latest even year)
year = datetime.date.today().year
cycle = year if year % 2 == 0 else year + 1

def read_txts(pattern, **read_csv_kwargs):
    paths = sorted(RAW.glob(pattern))
    frames = []
    for p in paths:
        try:
            df = pd.read_csv(p, sep="|", dtype=str, engine="python", **read_csv_kwargs)
            frames.append(df)
        except Exception as e:
            print(f"[warn] failed reading {p.name}: {e}")
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)

def safe_write_csv(df: pd.DataFrame, out_path: Path):
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(out_path)

def normalize_candidates():
    df = read_txts("cn.txt")
    if df.empty:
        print("[info] candidates: no input files in RAW")
        return
    df.rename(columns={c: c.lower() for c in df.columns}, inplace=True)
    keep = [c for c in df.columns if c in {
        "cand_id","cand_name","cand_pty_affiliation",
        "cand_election_yr","cand_office","cand_office_st",
        "cand_office_district","cand_status"
    }]
    if keep:
        df = df[keep].drop_duplicates()
    df["cycle"] = cycle
    safe_write_csv(df, WARE / "dim_candidates.csv")
    print(f"[ok] dim_candidates.csv rows={len(df):,}")

def normalize_committees():
    df = read_txts("cm.txt")
    if df.empty:
        print("[info] committees: no input files in RAW")
        return
    df.rename(columns={c: c.lower() for c in df.columns}, inplace=True)
    keep = [c for c in df.columns if c in {
        "cmte_id","cmte_nm","cmte_tp","cmte_pty_affiliation",
        "cmte_filing_freq","treas_nm","street_1","street_2",
        "city","state","zip"
    }]
    if keep:
        df = df[keep].drop_duplicates()
    df["cycle"] = cycle
    safe_write_csv(df, WARE / "dim_committees.csv")
    print(f"[ok] dim_committees.csv rows={len(df):,}")

def main():
    print(f"[init] RAW={RAW}  WAREHOUSE={WARE}  cycle={cycle}")
    normalize_candidates()
    normalize_committees()
    print("[done] normalization complete")

if __name__ == "__main__":
    main()
