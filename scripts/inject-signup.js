#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getSignupEndpoint } = require('./env');

const ROOT = path.resolve(__dirname, '..');
const HTML_FILES = [
  'index.html',
  'contact.html',
  'events.html',
  'about.html',
  'issues.html',
  'why-im-running.html',
  'record-contrast.html',
  'endorsements.html',
  'privacy-policy.html',
  '404.html',
  'plan.html',
  'index_live.html',
  'es/index.html',
  'es/contact.html',
  'es/events.html',
  'es/about.html',
  'es/issues.html',
  'es/why-im-running.html',
  'es/record-contrast.html',
  'es/endorsements.html'
];

function updateMeta(filePath, endpoint) {
  const file = fs.readFileSync(filePath, 'utf8');
  const metaRegex = /<meta[^>]*name="campaign-signup-endpoint"[^>]*>/i;
  if (!metaRegex.test(file)) {
    console.warn(`Skipping ${path.relative(ROOT, filePath)} (no campaign-signup-endpoint meta tag).`);
    return false;
  }
  const updated = file.replace(metaRegex, `<meta name="campaign-signup-endpoint" content="${endpoint}" />`);
  fs.writeFileSync(filePath, updated);
  return true;
}

function main() {
  const endpoint = getSignupEndpoint();
  let updatedCount = 0;
  HTML_FILES.forEach((relativePath) => {
    const fullPath = path.join(ROOT, relativePath);
    if (fs.existsSync(fullPath) && updateMeta(fullPath, endpoint)) updatedCount += 1;
  });
  console.log(`Injected signup endpoint meta tag in ${updatedCount} HTML files.`);
}

main();
