const fs = require('fs-extra');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'qr_map.csv');

function parseCsv() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}`);
  }
  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  return rows;
}

function validateRecords(rows) {
  const requiredColumns = ['qr_id', 'path', 'destination_url'];
  const errors = [];
  const seenIds = new Set();
  const normalized = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // account for header row
    requiredColumns.forEach(col => {
      if (!row[col]) {
        errors.push(`Row ${rowNumber}: missing required column '${col}'.`);
      }
    });

    if (!row.qr_id) {
      return;
    }

    const qrId = row.qr_id.trim();
    if (!/^[a-z0-9-]+$/.test(qrId)) {
      errors.push(`Row ${rowNumber}: qr_id '${qrId}' must be lowercase, numbers, and hyphens only.`);
    }

    if (seenIds.has(qrId)) {
      errors.push(`Row ${rowNumber}: duplicate qr_id '${qrId}'.`);
    }
    seenIds.add(qrId);

    const pathValue = (row.path || '').trim();
    if (!pathValue.startsWith('/go/')) {
      errors.push(`Row ${rowNumber}: path '${pathValue}' must start with /go/.`);
    } else {
      const expectedPath = `/go/${qrId}`;
      if (pathValue !== expectedPath) {
        errors.push(`Row ${rowNumber}: path '${pathValue}' must match qr_id (${expectedPath}).`);
      }
    }

    const destination = (row.destination_url || '').trim();
    try {
      // eslint-disable-next-line no-new
      new URL(destination);
    } catch (err) {
      errors.push(`Row ${rowNumber}: destination_url '${destination}' is not a valid URL.`);
    }

    normalized.push({
      qr_id: qrId,
      path: pathValue,
      destination_url: destination,
      dest_label: (row.dest_label || '').trim() || null,
      notes: (row.notes || '').trim() || null
    });
  });

  return { errors, records: normalized };
}

function loadQrRecords() {
  const rows = parseCsv();
  const { errors, records } = validateRecords(rows);
  if (errors.length) {
    const msg = errors.join('\n');
    throw new Error(`QR CSV validation failed:\n${msg}`);
  }
  return records;
}

module.exports = {
  loadQrRecords,
  CSV_PATH,
  ROOT
};
