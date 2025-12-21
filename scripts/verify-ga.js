#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { getMeasurementId } = require('./env');

const ROOT = path.resolve(__dirname, '..');

function walkHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }

  return files;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const measurementId = getMeasurementId();
  const htmlFiles = walkHtmlFiles(ROOT);

  assert(htmlFiles.length > 0, 'No HTML files found to verify GA.');

  const srcPattern = new RegExp(`https://www\\.googletagmanager\\.com/gtag/js\\?id=${measurementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const configPattern = new RegExp(`gtag\\(['"]config['"],\\s*['"]${measurementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
  const anyGPattern = /G-[A-Z0-9]{4,}/i;

  const withSrc = [];
  const withConfig = [];
  const withAnyId = [];

  htmlFiles.forEach(file => {
    const contents = fs.readFileSync(file, 'utf8');
    if (srcPattern.test(contents)) withSrc.push(file);
    if (configPattern.test(contents)) withConfig.push(file);
    if (anyGPattern.test(contents)) withAnyId.push(file);
  });

  assert(withSrc.length > 0, 'No HTML files include gtag.js with the configured GA4 measurement ID.');
  assert(withConfig.length > 0, 'No HTML files configure gtag with the GA4 measurement ID.');
  assert(withAnyId.length > 0, 'No GA-like measurement IDs (G-XXXXXX) were found in the built HTML.');

  const homePath = path.join(ROOT, 'index.html');
  assert(fs.existsSync(homePath), 'Homepage index.html not found.');
  const homeHtml = fs.readFileSync(homePath, 'utf8');
  assert(srcPattern.test(homeHtml), 'Homepage is missing gtag.js with the GA4 measurement ID.');
  assert(configPattern.test(homeHtml), 'Homepage is missing gtag config for the GA4 measurement ID.');

  console.log(`GA verification passed for ${withSrc.length} files with gtag.js present.`);
}

main();
