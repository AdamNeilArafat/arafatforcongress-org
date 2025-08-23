import re, requests
from pathlib import Path
from bs4 import BeautifulSoup

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)

index_url = "https://www.fec.gov/files/bulk-downloads/"
resp = requests.get(index_url, timeout=30)
resp.raise_for_status()

soup = BeautifulSoup(resp.text, "html.parser")
years = sorted({int(a.text.strip("/")) for a in soup.find_all("a") if re.match(r"^\d{4}/$", a.text)})
latest = years[-1]
print(f"[info] Latest cycle detected: {latest}")

base = f"https://www.fec.gov/files/bulk-downloads/{latest}"
for fname in ["cn.txt", "cm.txt"]:
    url = f"{base}/{fname}"
    out = RAW / fname
    print(f"[fetch] {url} -> {out}")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    out.write_bytes(r.content)

print("[done] Downloaded cn.txt and cm.txt")
