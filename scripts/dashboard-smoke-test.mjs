#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertCheck(condition, passMessage, failMessage) {
  if (!condition) {
    throw new Error(failMessage);
  }
  console.log(`PASS: ${passMessage}`);
}

function countInvalidDates(records, field) {
  return records.filter((record) => {
    const value = record[field];
    if (!value) return false;
    return Number.isNaN(Date.parse(value));
  }).length;
}

function summarizeFollowups(records) {
  const today = new Date().toISOString().slice(0, 10);
  const due = records.filter((record) => {
    if (!record.followup) return false;
    return record.followup <= today && !['active', 'declined'].includes((record.status || '').toLowerCase());
  });

  return {
    total: due.length,
    dueToday: due.filter((record) => record.followup === today).length,
    overdue: due.filter((record) => record.followup < today).length
  };
}

function main() {
  console.log('Dashboard smoke test starting...');

  const dashboardHtml = read('admin/volunteer-dashboard.html');
  assertCheck(
    dashboardHtml.includes('id="dashboard"') && dashboardHtml.includes('id="contacts-tbody"'),
    'Dashboard shell and contacts table container are present',
    'Missing dashboard shell or contacts table container in admin/volunteer-dashboard.html'
  );

  assertCheck(
    dashboardHtml.includes('renderFollowUpAlert()') && dashboardHtml.includes('id="followup-alert"'),
    'Follow-up alert container and renderer are present',
    'Missing follow-up alert renderer wiring in admin/volunteer-dashboard.html'
  );

  assertCheck(
    dashboardHtml.includes('id="total-calls"') && dashboardHtml.includes('id="total-texts"'),
    'Canvass metrics include phone calls and texts totals',
    'Missing call/text KPI fields in canvass totals cards'
  );

  const contactsPath = 'data/contacts.json';
  const rawContacts = JSON.parse(read(contactsPath));
  const contacts = Array.isArray(rawContacts) ? rawContacts : rawContacts.contacts;
  assertCheck(Array.isArray(contacts), 'contacts.json exposes a contacts array', `${contactsPath} must contain an array or an object with a contacts array`);

  const requiredFields = ['firstName', 'lastName', 'status', 'interest'];
  const missingRequired = contacts.filter((contact) => requiredFields.some((field) => !(field in contact))).length;
  assertCheck(
    missingRequired === 0,
    'All contacts include required dashboard fields (firstName,lastName,status,interest)',
    `${missingRequired} contacts are missing required fields used by the dashboard`
  );

  const invalidFollowupDates = countInvalidDates(contacts, 'followup');
  assertCheck(
    invalidFollowupDates === 0,
    'All contact follow-up values are valid ISO-compatible dates',
    `${invalidFollowupDates} contacts have invalid follow-up date values`
  );

  const rawOutreach = JSON.parse(read('data/outreach_data.json'));
  const outreachLogs = Array.isArray(rawOutreach) ? rawOutreach : rawOutreach.records;
  assertCheck(Array.isArray(outreachLogs), 'outreach_data.json exposes a records array', 'data/outreach_data.json must contain an array or an object with a records array');

  const invalidOutreachNumbers = outreachLogs.filter((log) => {
    return ['doors', 'flyers', 'calls', 'texts'].some((field) => {
      const value = log[field];
      return value !== undefined && value !== null && Number.isNaN(Number(value));
    });
  }).length;

  assertCheck(
    invalidOutreachNumbers === 0,
    'Outreach logs have numeric totals for doors/flyers/calls/texts',
    `${invalidOutreachNumbers} outreach logs contain non-numeric totals`
  );

  const capacity = JSON.parse(read('data/volunteer-tracker.json'));
  assertCheck(capacity.roles && capacity.areas, 'volunteer-tracker.json includes roles and areas sections', 'volunteer-tracker.json must include roles and areas');

  const followups = summarizeFollowups(contacts);
  console.log(`INFO: Follow-up queue snapshot => total_due=${followups.total}, due_today=${followups.dueToday}, overdue=${followups.overdue}`);
  console.log(`INFO: Contacts loaded=${contacts.length}; outreach logs loaded=${outreachLogs.length}`);

  console.log('Dashboard smoke test completed successfully.');
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
}
