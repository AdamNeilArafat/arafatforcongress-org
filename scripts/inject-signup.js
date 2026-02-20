#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getSignupEndpoint } = require('./env');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');

function main() {
  const endpoint = getSignupEndpoint();
  const file = fs.readFileSync(INDEX_HTML, 'utf8');
  const metaRegex = /<meta[^>]*name="campaign-signup-endpoint"[^>]*>/i;

  if (!metaRegex.test(file)) {
    throw new Error('Missing campaign-signup-endpoint meta tag in index.html');
  }

  const updated = file.replace(metaRegex, `<meta name="campaign-signup-endpoint" content="${endpoint}" />`);
  fs.writeFileSync(INDEX_HTML, updated);
  console.log('Injected signup endpoint meta tag in index.html.');
}

main();
