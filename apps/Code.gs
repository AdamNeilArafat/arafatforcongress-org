const SHEET_NAME = 'signatures';

function doPost(e) {
  const params = e ? e.parameter : {};
  const type = params.type || '';
  const candidateConfirmed = params.candidate_confirmed || '';

  if (type === 'candidate' && candidateConfirmed !== 'true') {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'candidate_confirmed must be true for candidate' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeader(sheet);

  const row = [
    new Date(),
    params.source || '',
    type,
    params.name || '',
    params.email || '',
    params.phone || '',
    params.zip || '',
    params.topic || '',
    params.message || '',
    params.userAgent || '',
    params.utm_source || '',
    params.utm_medium || '',
    params.utm_campaign || '',
    candidateConfirmed
  ];

  sheet.appendRow(row);

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

function ensureHeader(sheet) {
  const header = [
    'timestamp',
    'source',
    'type',
    'name',
    'email',
    'phone',
    'zip',
    'topic',
    'message',
    'userAgent',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'candidate_confirmed'
  ];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
  }
}
