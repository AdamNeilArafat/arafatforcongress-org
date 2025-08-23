
import pandas as pd, glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
WARE = ROOT / "data" / "warehouse"
WARE.mkdir(parents=True, exist_ok=True)

def read_txts(pattern):
    files = glob.glob(pattern, recursive=True)
    dfs = []
    for f in files:
        try:
            dfs.append(pd.read_csv(f, sep="|", dtype=str, engine="python", low_memory=False))
        except Exception:
            pass
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

cand = read_txts(str(RAW / "**/candidate_master/*.txt"))
comm = read_txts(str(RAW / "**/committee_master/*.txt"))
link = read_txts(str(RAW / "**/candidate_comm_links/*.txt"))

if not cand.empty:
    cand.to_parquet(WARE / "dim_candidates.parquet", index=False)
if not comm.empty:
    comm.to_parquet(WARE / "dim_committees.parquet", index=False)
if not link.empty:
    link.to_parquet(WARE / "dim_cand_comm_link.parquet", index=False)

print("Dimensions written:", {
    "candidates": len(cand) if not cand.empty else 0,
    "committees": len(comm) if not comm.empty else 0,
    "cand_comm_link": len(link) if not link.empty else 0
})
