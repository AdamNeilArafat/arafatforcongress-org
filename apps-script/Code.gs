const SPREADSHEET_ID  = '1QsCLdoqe4h_vtifUfbJFKOWHk_zAcNEnc6aXeQ8mLRY';
const SIGNATURES_SHEET = 'signatures';
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

function ensureHeader(name) {
  const sh = sheet(name);
  const headers = [
    'timestamp', 'type', 'email', 'email_hash', 'ip', 'city', 'state',
    'user_agent', 'first_name', 'last_name'
  ];
  const first = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const empty = first.every(v => String(v).trim() === '');
  if (empty) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
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

function doPost(e) {
  try {
    const body = parseBody(e);
    const type = String(body.type || '').toLowerCase().trim();
    const email = String(body.email || '').toLowerCase().trim();
    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const city = String(body.city || '').trim();
    const state = String(body.state || '').trim();
    const userAgent = String(body.userAgent || '').trim();

    if (!['candidate', 'voter'].includes(type)) throw new Error('Invalid "type".');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid "email".');
    if (!firstName || !lastName) throw new Error('First and last name are required.');

    const emailHash = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
    );

    const ip = e.parameter['x-forwarded-for'] || e.parameter['cf-connecting-ip'] || '';

    ensureHeader(SIGNATURES_SHEET);
    const sh = sheet(SIGNATURES_SHEET);
    const values = sh.getDataRange().getValues();
    for (let r = 1; r < values.length; r++) {
      const rowType = (values[r][1] || '').toString().toLowerCase();
      const rowHash = (values[r][3] || '').toString();
      if (rowType === type && rowHash === emailHash) {
        return out({ ok: true, duplicate: true });
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
      lastName
    ]);

    CacheService.getScriptCache().remove(CACHE_KEY);

    return out({ ok: true, duplicate: false });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

