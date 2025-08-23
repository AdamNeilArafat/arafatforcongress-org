FEC Nightly Ingest (subfolder)

This folder holds the code for nightly FEC ingestion.
First run backfills from 2021-01-01, then it only pulls new data nightly.
Outputs land in fec-nightly/data/warehouse/ as Parquet and a small state file in fec-nightly/data/raw/.

Do not store secrets here. Set OPENFEC_API_KEY in your repo's Actions secrets.
