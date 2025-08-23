import datetime, requests, zipfile, io
from pathlib import Path

# Point to fec-nightly-subfolder/fec-nightly/data/raw
ROOT = Path(__file__).resolve().parents[1] / "fec-nightly-subfolder" / "fec-nightly"
RAW = ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

# Determine current election cycle (latest even year)
year = datetime.date.today().year
cycle = year if year % 2 == 0 else year + 1
print(f"[info] Using cycle {cycle}")

base = f"https://www.fec.gov/files/bulk-downloads/{cycle}"
files = {
    "cn": f"cn{str(cycle)[-2:]}.zip",
    "cm": f"cm{str(cycle)[-2:]}.zip",
}

for key, fname in files.items():
    url = f"{base}/{fname}"
    print(f"[fetch] {url}")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    for name in z.namelist():
        if name.lower().endswith(".txt"):
            out = RAW / f"{key}.txt"
            with z.open(name) as fsrc, open(out, "wb") as fdst:
                fdst.write(fsrc.read())
            print(f"[ok] extracted {name} -> {out}")

print("[done] Downloaded and extracted cn/cm")
