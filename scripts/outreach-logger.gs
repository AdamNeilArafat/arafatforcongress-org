/**
 * Arafat for Congress — Volunteer Outreach Logger
 * Google Apps Script Web App
 *
 * Accepts POST requests from the campaign website's "Log your outreach" form
 * and appends rows to the "Volunteer Reports" tab in the campaign spreadsheet.
 *
 * ── DEPLOY INSTRUCTIONS (one-time, ~3 minutes) ────────────────────────────
 * 1. Open: https://docs.google.com/spreadsheets/d/1waU1ZDIKlGgkTCDwMThsDZsWMR0PJpzyhYImGPCWzeY
 * 2. Click Extensions → Apps Script
 * 3. Delete any existing code in the editor
 * 4. Paste this entire file
 * 5. Click Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Click Deploy → copy the Web app URL
 * 7. In contact.html, set OUTREACH_SCRIPT_URL to that URL
 * 8. Done. The form will now write directly to the sheet.
 *
 * ── OUTPUT SHEET ──────────────────────────────────────────────────────────
 * Tab name:  Volunteer Reports
 * Columns:   Timestamp | Date | Name | Activity Type | Area | Count | Notes
 * ─────────────────────────────────────────────────────────────────────────
 */

var SPREADSHEET_ID = '1waU1ZDIKlGgkTCDwMThsDZsWMR0PJpzyhYImGPCWzeY';
var TAB_NAME       = 'Volunteer Reports';

/** Called by the website form — handles cross-origin POST */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Basic validation
    if (!data.count || isNaN(parseInt(data.count, 10))) {
      return respond_({ success: false, error: 'Count is required and must be a number.' });
    }
    if (parseInt(data.count, 10) < 1 || parseInt(data.count, 10) > 9999) {
      return respond_({ success: false, error: 'Count must be between 1 and 9,999.' });
    }

    var sheet = getOrCreateTab_();
    sheet.appendRow([
      new Date().toISOString(),                           // Timestamp (auto)
      (data.date  || '').toString().trim().substring(0, 20),  // Date
      (data.name  || 'Anonymous').toString().trim().substring(0, 80),  // Name
      (data.type  || '').toString().trim().substring(0, 80),  // Activity Type
      (data.area  || '').toString().trim().substring(0, 80),  // Area / Precinct
      parseInt(data.count, 10),                           // Count (numeric)
      sanitize_((data.notes || '').toString()).substring(0, 500)  // Notes (sanitized)
    ]);

    return respond_({ success: true, message: 'Logged! Thank you for your outreach.' });
  } catch (err) {
    return respond_({ success: false, error: 'Server error: ' + err.toString() });
  }
}

/** Handle preflight OPTIONS for CORS (not typically called by Apps Script but included for safety) */
function doGet(e) {
  return respond_({ success: false, error: 'Use POST to submit outreach data.' });
}

/** Builds a JSON response with CORS headers */
function respond_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Gets the Volunteer Reports tab, creating it with headers if needed */
function getOrCreateTab_() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TAB_NAME);
    var headers = ['Timestamp', 'Date', 'Volunteer Name', 'Activity Type', 'Area / Precinct', 'Count', 'Notes'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
    Logger.log('Created tab: ' + TAB_NAME);
  }
  return sheet;
}

/** Strips common PII patterns and trims whitespace */
function sanitize_(text) {
  if (!text) return '';
  text = text.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email]');
  text = text.replace(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/g,           '[phone]');
  return text.trim();
}

/** Manual test — run once in Apps Script editor to verify setup (View → Logs) */
function testSubmit() {
  var mockPost = {
    postData: {
      contents: JSON.stringify({
        date:  '2026-03-01',
        name:  'Test Volunteer',
        type:  'Door Knock / Canvass',
        area:  'Spanaway',
        count: '42',
        notes: 'Good response on housing. Left lit at 3 houses with no answer.'
      })
    }
  };
  var result = doPost(mockPost);
  Logger.log('Result: ' + result.getContent());
}
