import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { db, nowIso, randomId } from '../db/index.js';

const TEMP_DIR = path.resolve(process.cwd(), 'data/imports');
fs.mkdirSync(TEMP_DIR, { recursive: true });

const DEFAULT_DEDUPE = {
  exactEmail: true,
  normalizedPhone: true,
  nameStreetZip: true,
  householdMerge: true
};

const FIELD_SYNONYMS = {
  first_name: ['first_name', 'firstname', 'first', 'fname'],
  last_name: ['last_name', 'lastname', 'last', 'lname'],
  line1: ['address', 'line1', 'street', 'street1'],
  city: ['city', 'town'],
  state: ['state', 'st'],
  postal_code: ['zip', 'zipcode', 'postal', 'postal_code'],
  email: ['email', 'email_address'],
  phone: ['phone', 'mobile', 'cell']
};

function normalizePhone(phone = '') { return phone.replace(/\D/g, ''); }
function normalizeEmail(email = '') { return email.trim().toLowerCase(); }
function dedupeHash(row) {
  return [row.first_name?.toLowerCase(), row.last_name?.toLowerCase(), row.line1?.toLowerCase(), row.postal_code].join('|');
}

function autoMapping(headers = []) {
  const normalized = headers.map((h) => String(h || '').trim().toLowerCase());
  const mapping = {};
  Object.entries(FIELD_SYNONYMS).forEach(([field, synonyms]) => {
    const idx = normalized.findIndex((h) => synonyms.includes(h));
    if (idx >= 0) mapping[field] = headers[idx];
  });
  return mapping;
}

function normalizeRaw(row, mapping = {}) {
  const pick = (field, fallback) => row[mapping[field]] || fallback;
  return {
    first_name: pick('first_name', row.first_name || row.firstName || row.fname),
    last_name: pick('last_name', row.last_name || row.lastName || row.lname),
    line1: pick('line1', row.address || row.line1 || row.street),
    city: pick('city', row.city),
    state: pick('state', row.state),
    postal_code: pick('postal_code', row.zip || row.postal_code),
    email: pick('email', row.email),
    phone: pick('phone', row.phone)
  };
}

export function previewCsvFile(fullPath, sampleSize = 50) {
  const content = fs.readFileSync(fullPath, 'utf8');
  const [headerLine = ''] = content.split(/\r?\n/, 1);
  const headers = headerLine.split(',').map((s) => s.trim()).filter(Boolean);
  const rows = [];
  const parser = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
  for (const row of parser) {
    rows.push(row);
    if (rows.length >= sampleSize) break;
  }
  return { headers, sampleRows: rows, autoMapping: autoMapping(headers) };
}

export function createImportJob({ fileName, mapping = {}, dedupeRules = DEFAULT_DEDUPE, dryRun = false }) {
  const id = randomId('job');
  const now = nowIso();
  db.prepare('INSERT INTO import_jobs (id, file_name, status, mapping_json, dedupe_rules_json, error_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, fileName, 'staged', JSON.stringify(mapping), JSON.stringify(dedupeRules), dryRun ? 'dry_run' : null, now, now);
  return id;
}

export async function stageCsvFile(jobId, fullPath) {
  const parser = fs.createReadStream(fullPath).pipe(parse({ columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }));
  let rowNumber = 0;
  for await (const row of parser) {
    rowNumber += 1;
    db.prepare('INSERT INTO import_rows (id, import_job_id, row_number, raw_row_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomId('row'), jobId, rowNumber, JSON.stringify(row), 'staged', nowIso(), nowIso());
  }
  db.prepare('UPDATE import_jobs SET total_rows=?, status=?, updated_at=? WHERE id=?').run(rowNumber, 'ready', nowIso(), jobId);
  return rowNumber;
}

export function setImportJobState(jobId, action) {
  const paused = action === 'pause' ? 1 : 0;
  const status = action === 'cancel' ? 'cancelled' : action === 'resume' ? 'processing' : 'paused';
  db.prepare('UPDATE import_jobs SET paused=?, status=?, updated_at=? WHERE id=?').run(paused, status, nowIso(), jobId);
}

function findMatch(normalized, dedupeRules) {
  if (dedupeRules.exactEmail && normalized.email) {
    const found = db.prepare('SELECT c.* FROM contacts c JOIN emails e ON e.contact_id = c.id WHERE e.email_normalized = ? LIMIT 1').get(normalizeEmail(normalized.email));
    if (found) return found;
  }
  if (dedupeRules.normalizedPhone && normalized.phone) {
    const found = db.prepare('SELECT c.* FROM contacts c JOIN phones p ON p.contact_id = c.id WHERE p.number_normalized = ? LIMIT 1').get(normalizePhone(normalized.phone));
    if (found) return found;
  }
  if (dedupeRules.nameStreetZip) {
    const hash = dedupeHash(normalized);
    const found = db.prepare('SELECT * FROM contacts WHERE dedupe_hash = ? LIMIT 1').get(hash);
    if (found) return found;
  }
  return null;
}

export function processImportJob(jobId, chunkSize = 250) {
  const job = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId);
  if (!job || job.status === 'cancelled' || job.paused) return { processed: 0, done: true };

  const dedupeRules = job.dedupe_rules_json ? JSON.parse(job.dedupe_rules_json) : DEFAULT_DEDUPE;
  const mapping = job.mapping_json ? JSON.parse(job.mapping_json) : {};
  const rows = db.prepare("SELECT * FROM import_rows WHERE import_job_id = ? AND status = 'staged' AND row_number > ? ORDER BY row_number LIMIT ?").all(jobId, Number(job.cursor || 0), chunkSize);

  let inserted = 0; let merged = 0; let errored = 0;
  const now = nowIso();

  db.transaction(() => {
    for (const row of rows) {
      try {
        const raw = JSON.parse(row.raw_row_json);
        const normalized = normalizeRaw(raw, mapping);
        const isDryRun = job.error_summary === 'dry_run';
        const match = findMatch(normalized, dedupeRules);
        if (match) {
          db.prepare('UPDATE import_rows SET status=?, merge_contact_id=?, normalized_row_json=?, updated_at=? WHERE id=?').run('merged', match.id, JSON.stringify(normalized), now, row.id);
          merged += 1;
          continue;
        }
        if (isDryRun) {
          db.prepare('UPDATE import_rows SET status=?, normalized_row_json=?, updated_at=? WHERE id=?').run('preview', JSON.stringify(normalized), now, row.id);
          inserted += 1;
          continue;
        }

        const householdId = randomId('hh');
        const addressId = randomId('addr');
        const contactId = randomId('contact');
        db.prepare('INSERT INTO households (id, household_key, created_at, updated_at) VALUES (?, ?, ?, ?)').run(householdId, `${normalized.line1}|${normalized.postal_code}`.toLowerCase(), now, now);
        db.prepare('INSERT INTO addresses (id, household_id, line1, city, state, postal_code, geocode_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(addressId, householdId, normalized.line1, normalized.city, normalized.state, normalized.postal_code, 'pending', now, now);
        db.prepare('INSERT INTO contacts (id, household_id, primary_address_id, first_name, last_name, dedupe_hash, raw_import_payload_json, source_name, confidence_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(contactId, householdId, addressId, normalized.first_name, normalized.last_name, dedupeHash(normalized), row.raw_row_json, job.file_name, 0.7, now, now);
        if (normalized.email) db.prepare('INSERT INTO emails (id, contact_id, email_normalized, email_raw, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(randomId('email'), contactId, normalizeEmail(normalized.email), normalized.email, now, now);
        if (normalized.phone) db.prepare('INSERT INTO phones (id, contact_id, number_normalized, number_raw, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(randomId('phone'), contactId, normalizePhone(normalized.phone), normalized.phone, now, now);
        db.prepare('UPDATE import_rows SET status=?, merge_contact_id=?, normalized_row_json=?, updated_at=? WHERE id=?').run('inserted', contactId, JSON.stringify(normalized), now, row.id);
        inserted += 1;
      } catch (error) {
        db.prepare('UPDATE import_rows SET status=?, error_message=?, updated_at=? WHERE id=?').run('error', String(error), now, row.id);
        errored += 1;
      }
    }
  })();

  const lastRow = rows[rows.length - 1]?.row_number || job.cursor;
  db.prepare(`UPDATE import_jobs
    SET cursor = ?, processed_rows = processed_rows + ?, inserted_rows = inserted_rows + ?, merged_rows = merged_rows + ?, error_rows = error_rows + ?,
        status = CASE WHEN ? >= total_rows THEN 'completed' ELSE 'processing' END,
        updated_at = ?
    WHERE id = ?`).run(lastRow, rows.length, inserted, merged, errored, lastRow, now, jobId);

  const updated = db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId);
  return { processed: rows.length, inserted, merged, errored, cursor: updated.cursor, done: updated.status === 'completed' };
}

export function listImportJobs() { return db.prepare('SELECT * FROM import_jobs ORDER BY created_at DESC').all(); }
export function getImportJob(jobId) { return db.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId); }
