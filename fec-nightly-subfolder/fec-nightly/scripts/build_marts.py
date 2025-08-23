
import duckdb
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WARE = ROOT / "data" / "warehouse"
db = duckdb.connect(database=str(WARE / "fec.duckdb"))
db.execute("install parquet; load parquet;")

for t in ["schedule_a","schedule_b"]:
    for cyc in ["2022","2026","2024"]:
        p = WARE / t / cyc
        if p.exists():
            db.execute(f"CREATE OR REPLACE VIEW {t}_{cyc} AS SELECT * FROM parquet_scan('{p}/inc_*.parquet');")
print("DuckDB views created (if inputs exist).")
db.close()
