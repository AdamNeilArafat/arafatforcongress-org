#!/usr/bin/env node
const path = require('path');
const fs = require('fs-extra');
const QRCode = require('qrcode');
const { loadQrRecords, ROOT } = require('./qr-data');
const { getMeasurementId } = require('./env');

async function generateRedirectPage(entry, measurementId) {
  const pageDir = path.join(ROOT, entry.path.replace(/^\//, ''), '/');
  await fs.ensureDir(pageDir);
  const htmlPath = path.join(pageDir, 'index.html');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="ga-measurement-id" content="${measurementId}" />
  <title>Redirecting...</title>
  <script>
    (function initGA(){
      var measurementId = '${measurementId}';
      if (!measurementId) {
        console.error('GA measurement ID missing for redirect page ${entry.qr_id}');
        return;
      }
      window.dataLayer = window.dataLayer || [];
      function gtag(){ dataLayer.push(arguments); }
      gtag('js', new Date());
      gtag('config', measurementId, { transport_type: 'beacon', send_page_view: true });

      window.__qrEntry = ${JSON.stringify({
        qr_id: entry.qr_id,
        dest_label: entry.dest_label,
        destination_url: entry.destination_url
      })};
    })();
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
  <script>
    (function handleRedirect(){
      var entry = window.__qrEntry || {};
      var destination = entry.destination_url || '${entry.destination_url}';
      var delayMs = 250;
      function fire(){
        if (typeof gtag === 'function') {
          gtag('event', 'qr_redirect', {
            qr_id: entry.qr_id,
            dest_label: entry.dest_label,
            destination_url: destination
          });
        }
      }
      fire();
      setTimeout(function(){ window.location.href = destination; }, delayMs);
    })();
  </script>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; text-align: center; }
    .card { margin: 0 auto; max-width: 520px; padding: 24px; border: 1px solid #d9d9e3; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { color: #425466; }
    a { color: #2446f5; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Redirecting…</h1>
    <p>Sending you to <a href="${entry.destination_url}">${entry.destination_url}</a></p>
    <p>If you are not redirected automatically, click the link above.</p>
  </div>
</body>
</html>`;

  await fs.writeFile(htmlPath, html);
  return htmlPath;
}

async function generateQrPng(entry) {
  const outDir = path.join(ROOT, 'artifacts', 'qr');
  await fs.ensureDir(outDir);
  const outPath = path.join(outDir, `${entry.qr_id}.png`);
  const url = `https://arafatforcongress.org${entry.path}`;
  await QRCode.toFile(outPath, url, {
    errorCorrectionLevel: 'H',
    width: 1024,
    margin: 2,
    type: 'png'
  });
  return outPath;
}

async function writeManifest(entries) {
  const outDir = path.join(ROOT, 'artifacts', 'qr');
  await fs.ensureDir(outDir);
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = {
    generated_at: new Date().toISOString(),
    count: entries.length,
    base_url: 'https://arafatforcongress.org',
    items: entries
  };
  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  return manifestPath;
}

async function main() {
  const measurementId = getMeasurementId();
  const records = loadQrRecords();
  const outputs = [];

  for (const entry of records) {
    const htmlPath = await generateRedirectPage(entry, measurementId);
    const qrPath = await generateQrPng(entry);
    outputs.push({ entry, htmlPath, qrPath });
  }

  const manifestPath = await writeManifest(records);
  console.log(`Generated ${outputs.length} QR pages and PNGs.`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
