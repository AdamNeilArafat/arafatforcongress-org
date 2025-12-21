#!/usr/bin/env node
const path = require('path');
const fs = require('fs-extra');
const { loadQrRecords, ROOT } = require('./qr-data');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyOutputs(records) {
  const missing = [];
  records.forEach(entry => {
    const pagePath = path.join(ROOT, entry.path.replace(/^\//, ''), 'index.html');
    const pngPath = path.join(ROOT, 'artifacts', 'qr', `${entry.qr_id}.png`);
    if (!fs.existsSync(pagePath)) {
      missing.push(`Redirect page missing for ${entry.qr_id}: ${pagePath}`);
    }
    if (!fs.existsSync(pngPath)) {
      missing.push(`QR PNG missing for ${entry.qr_id}: ${pngPath}`);
    }
  });

  const manifestPath = path.join(ROOT, 'artifacts', 'qr', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    missing.push(`Manifest missing at ${manifestPath}`);
  } else {
    const manifest = fs.readJsonSync(manifestPath);
    assert(Array.isArray(manifest.items), 'Manifest items must be an array.');
    assert(manifest.items.length === records.length, `Manifest item count (${manifest.items.length}) does not match CSV (${records.length}).`);
  }

  if (missing.length) {
    throw new Error(`QR output verification failed:\n${missing.join('\n')}`);
  }
}

function main() {
  const records = loadQrRecords();
  console.log(`Validated ${records.length} QR rows from CSV.`);
  verifyOutputs(records);
  console.log('All QR outputs are present.');
}

main();
