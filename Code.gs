const SIGNATURES_SHEET = 'Signatures';
const EXPECTED_HEADERS = ['Timestamp', 'Name', 'Email', 'Zip'];

function ensureHeader(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  const header = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getValues()[0];
  const needsHeader = EXPECTED_HEADERS.some((h, i) => header[i] !== h);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
  }
  return sheet;
}

function doPost(e) {
  const sheet = ensureHeader(SIGNATURES_SHEET);
  const header = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getValues()[0];
  const valid = EXPECTED_HEADERS.every((h, i) => header[i] === h);
  if (!valid) {
    throw new Error('Unexpected header columns');
  }
  const row = EXPECTED_HEADERS.map(key => (e && e.parameter && key in e.parameter) ? e.parameter[key] : '');
  sheet.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({status: 'success'}))
                       .setMimeType(ContentService.MimeType.JSON);
}
