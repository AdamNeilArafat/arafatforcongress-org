const SPREADSHEET_ID  = '1QsCLdoqe4h_vtifUfbJFKOWHk_zAcNEnc6aXeQ8mLRY';
const SIGNATURES_SHEET = 'signatures';
const SUBMISSIONS_SHEET = 'submissions';
const STORE_RAW_EMAIL  = true;

const CACHE_KEY  = 'counts_v1';
const CACHE_SECS = 300; // 5 minutes

function sheet(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeader(name, headers) {
  const sh = sheet(name);
  const first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((h, i) => String(first[i] || '').trim() !== h);
  if (needsHeader) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function parseBody(e) {
  let body = {};
  if (e && e.postData) {
    const ct = String(e.postData.type || '').toLowerCase();
    if (ct.includes('application/json')) {
      body = JSON.parse(e.postData.contents || '{}');
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      body = e.parameter || {};
    }
  }
  return body;
}

function sanitize(v) {
  return String(v || '').trim();
}

function hashEmail(email) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email || '').toLowerCase().trim())
  );
}

function doGet(e) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEY);
  if (cached) {
    return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sh = sheet(SIGNATURES_SHEET);
  const values = sh.getDataRange().getValues();
  let candidateCount = 0;
  let voterCount = 0;
  for (let r = 1; r < values.length; r++) {
    const type = String(values[r][1] || '').toLowerCase();
    if (type === 'candidate') candidateCount++;
    else if (type === 'voter') voterCount++;
  }
  const payload = JSON.stringify({ candidateCount, voterCount });
  cache.put(CACHE_KEY, payload, CACHE_SECS);
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function saveLeadSubmission(body, ip, userAgent) {
  const fullName = sanitize(body.fullName);
  const email = sanitize(body.email).toLowerCase();
  const zip = sanitize(body.zip);
  const message = sanitize(body.message);
  const consent = String(body.consent || '').toLowerCase() === 'true' || String(body.consent || '').toLowerCase() === 'on';
  const consentText = sanitize(body.consentText);
  const source = sanitize(body.source);
  const actionType = sanitize(body.actionType);
  const topic = sanitize(body.topic);

  if (!fullName) throw new Error('Full name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email.');
  if (!/^\d{5}$/.test(zip)) throw new Error('ZIP code must be 5 digits.');
  if (!message) throw new Error('Message is required.');
  if (!consent) throw new Error('Consent is required.');
  if (!actionType) throw new Error('actionType is required.');

  const headers = [
    'timestamp', 'action_type', 'source', 'topic', 'full_name', 'email', 'email_hash',
    'zip', 'message', 'consent', 'consent_text', 'ip', 'user_agent'
  ];
  ensureHeader(SUBMISSIONS_SHEET, headers);
  const sh = sheet(SUBMISSIONS_SHEET);

  sh.appendRow([
    new Date(),
    actionType,
    source,
    topic,
    fullName,
    STORE_RAW_EMAIL ? email : '',
    hashEmail(email),
    zip,
    message,
    consent ? 'true' : 'false',
    consentText,
    ip,
    userAgent
  ]);

  return out({ ok: true, actionType, source });
}

function saveSignature(body, e) {
  const type = sanitize(body.type).toLowerCase();
  const email = sanitize(body.email).toLowerCase();
  const firstName = sanitize(body.firstName);
  const lastName = sanitize(body.lastName);
  const city = sanitize(body.city);
  const state = sanitize(body.state);
  const userAgent = sanitize(body.userAgent);
  const candidateConfirmed = String(body.candidateConfirmed || '').toLowerCase() === 'true';

  if (!['candidate', 'voter'].includes(type)) throw new Error('Invalid "type".');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid "email".');
  if (!firstName || !lastName) throw new Error('First and last name are required.');

  const emailHash = hashEmail(email);
  const ip = (e && e.parameter && (e.parameter['x-forwarded-for'] || e.parameter['cf-connecting-ip'])) || '';

  const headers = [
    'timestamp', 'type', 'email', 'email_hash', 'ip', 'city', 'state',
    'user_agent', 'first_name', 'last_name', 'candidate_confirmed'
  ];
  ensureHeader(SIGNATURES_SHEET, headers);

  const sh = sheet(SIGNATURES_SHEET);
  const values = sh.getDataRange().getValues();
  let candidateCount = 0;
  let voterCount = 0;
  for (let r = 1; r < values.length; r++) {
    const rowType = (values[r][1] || '').toString().toLowerCase();
    const rowHash = (values[r][3] || '').toString();
    if (rowType === 'candidate') candidateCount++;
    else if (rowType === 'voter') voterCount++;
    if (rowType === type && rowHash === emailHash) {
      return out({ ok: true, duplicate: true, candidateCount, voterCount });
    }
  }

  sh.appendRow([
    new Date(),
    type,
    STORE_RAW_EMAIL ? email : '',
    emailHash,
    ip,
    city,
    state,
    userAgent,
    firstName,
    lastName,
    candidateConfirmed ? 'true' : 'false'
  ]);

  if (type === 'candidate') candidateCount++;
  else if (type === 'voter') voterCount++;

  CacheService.getScriptCache().remove(CACHE_KEY);
  return out({ ok: true, duplicate: false, candidateCount, voterCount });
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const type = sanitize(body.type).toLowerCase();
    const ip = (e && e.parameter && (e.parameter['x-forwarded-for'] || e.parameter['cf-connecting-ip'])) || '';
    const userAgent = sanitize(body.userAgent || (e && e.parameter && e.parameter['user-agent']));

    if (type === 'candidate' || type === 'voter') {
      return saveSignature(body, e);
    }
    return saveLeadSubmission(body, ip, userAgent);
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
