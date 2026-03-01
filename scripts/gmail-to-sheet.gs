/**
 * Arafat for Congress — Gmail OUTREACH Email Parser
 * Google Apps Script: Parses emails with subject containing "OUTREACH"
 * and appends outreach metrics to the campaign Google Sheet.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1-HyfrBEUsQnia1MsReY0LHffhwosaeRcyaYgLI5me9E
 * 2. Go to Extensions > Apps Script
 * 3. Paste this entire file into the script editor
 * 4. Set SHEET_NAME to the name of your "Outreach" tab (create it if needed)
 * 5. Click "Run" > "parseOutreachEmails" once to authorize Gmail/Sheets permissions
 * 6. Set up a time-based trigger: Triggers > Add Trigger > parseOutreachEmails > Time-driven > Every hour
 *
 * EMAIL FORMAT EXPECTED (send from team with subject: "OUTREACH"):
 *   Volunteer_Group: Field and Community
 *   Outreach_Count: 47
 *   Date: 2026-03-01
 *   Notes: Knocked doors in Spanaway near JBLM gate
 *
 * SHEET COLUMNS (auto-created if missing):
 *   A: Timestamp | B: Date | C: Volunteer_Group | D: Outreach_Count | E: Notes | F: Source_Email
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
var SPREADSHEET_ID = '1-HyfrBEUsQnia1MsReY0LHffhwosaeRcyaYgLI5me9E';
var SHEET_NAME     = 'Outreach';
var SEARCH_LABEL   = 'OUTREACH';          // Gmail search term (subject contains)
var PROCESSED_TAG  = 'outreach-processed'; // Gmail label applied after parsing
var MAX_EMAILS     = 50;                   // Max emails to process per run
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point. Called by the time-driven trigger.
 */
function parseOutreachEmails() {
  var sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);

  // Search for unprocessed OUTREACH emails
  var query   = 'subject:' + SEARCH_LABEL + ' -label:' + PROCESSED_TAG;
  var threads = GmailApp.search(query, 0, MAX_EMAILS);

  if (threads.length === 0) {
    Logger.log('No new OUTREACH emails found.');
    return;
  }

  var processedLabel = getOrCreateLabel_(PROCESSED_TAG);
  var rows = [];

  threads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(msg) {
      var parsed = parseEmailBody_(msg.getPlainBody(), msg.getFrom(), msg.getDate());
      if (parsed) {
        rows.push(parsed);
      }
    });
    // Mark thread as processed
    thread.addLabel(processedLabel);
  });

  if (rows.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log('Appended ' + rows.length + ' outreach record(s).');
  } else {
    Logger.log('Found threads but no parseable OUTREACH data.');
  }
}

/**
 * Parses a single email body for outreach fields.
 * Returns a row array or null if required fields are missing.
 *
 * @param {string} body      - Plain text body of the email
 * @param {string} fromEmail - Sender address (used as source, PII is not stored verbatim)
 * @param {Date}   msgDate   - Date the message was received
 */
function parseEmailBody_(body, fromEmail, msgDate) {
  // Extract fields using case-insensitive key: value pattern
  var volunteerGroup  = extractField_(body, 'Volunteer_Group');
  var outreachCount   = extractField_(body, 'Outreach_Count');
  var date            = extractField_(body, 'Date');
  var notes           = extractField_(body, 'Notes') || '';

  // Require at minimum an outreach count
  if (!outreachCount || isNaN(parseInt(outreachCount, 10))) {
    Logger.log('Skipping message — missing or invalid Outreach_Count.');
    return null;
  }

  // Sanitize: strip any PII from notes (email addresses, phone numbers)
  notes = stripPII_(notes);

  // Use parsed date or fall back to message receive date
  var reportDate = date ? date.trim() : Utilities.formatDate(msgDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // PII guard: store only domain of sender, not full address
  var senderDomain = fromEmail.replace(/.*@/, '@').replace(/>.*/, '').trim();

  return [
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), // Timestamp
    reportDate,                    // Date
    (volunteerGroup || '').trim(), // Volunteer_Group
    parseInt(outreachCount, 10),   // Outreach_Count (numeric)
    notes.substring(0, 500),       // Notes (capped at 500 chars)
    senderDomain                   // Source domain only — no PII
  ];
}

/** Extracts "Key: Value" from email body, returns trimmed value or null */
function extractField_(body, key) {
  var regex  = new RegExp(key + '\\s*:\\s*(.+)', 'i');
  var match  = body.match(regex);
  return match ? match[1].trim() : null;
}

/** Strips common PII patterns from a string */
function stripPII_(text) {
  if (!text) return '';
  // Remove email addresses
  text = text.replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, '[email redacted]');
  // Remove phone numbers (various formats)
  text = text.replace(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/g, '[phone redacted]');
  // Remove SSN-like patterns
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[id redacted]');
  return text;
}

/** Gets or creates the named sheet tab */
function getOrCreateSheet_() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('Created new sheet tab: ' + SHEET_NAME);
  }
  return sheet;
}

/** Ensures header row exists on the sheet */
function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'Date', 'Volunteer_Group', 'Outreach_Count', 'Notes', 'Source_Domain']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    Logger.log('Header row created.');
  }
}

/** Gets or creates a Gmail label */
function getOrCreateLabel_(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

/**
 * Manual test function — run this once to verify the parser works.
 * Check Logs (View > Logs) after running.
 */
function testParser() {
  var sampleBody = [
    'Volunteer_Group: Field and Community',
    'Outreach_Count: 23',
    'Date: 2026-03-01',
    'Notes: Canvassed Spanaway neighborhood near 176th St. Good reception on housing issues.'
  ].join('\n');

  var result = parseEmailBody_(sampleBody, 'volunteer@arafatforcongress.org', new Date());
  Logger.log('Test parse result: ' + JSON.stringify(result));
}
