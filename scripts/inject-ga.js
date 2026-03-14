#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { getOptionalMeasurementId } from './env.js';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const ROOT = path.resolve(__dirname, '..');

function walkHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  entries.forEach(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  });
  return files;
}

function ensureMeasurementMeta(contents, measurementId) {
  const metaRegex = /<meta[^>]*name="ga-measurement-id"[^>]*content="([^"]*)"[^>]*>/i;
  if (metaRegex.test(contents)) {
    return contents.replace(metaRegex, match => match.replace(/content="([^"]*)"/, `content="${measurementId}"`));
  }

  return contents.replace(/<head[^>]*>/i, match => `${match}\n  <meta name="ga-measurement-id" content="${measurementId}" />`);
}

function stripLegacyLoader(contents) {
  return contents.replace(/\s*<script src="\/js\/ga-loader\.js"><\/script>/gi, '\n');
}

function ensureGtagSnippet(contents, measurementId) {
  const snippet = `  <script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>\n  <script>\n    window.dataLayer = window.dataLayer || [];\n    function gtag(){dataLayer.push(arguments);}\n    gtag('js', new Date());\n    gtag('config', '${measurementId}');\n  </script>`;

  const srcRegex = /googletagmanager\.com\/gtag\/js\?id=([^"'>]+)/i;
  const configRegex = /gtag\(['"]config['"],\s*['"]([^'"\)]+)['"][^\)]*\)/i;

  let updated = contents;

  if (srcRegex.test(updated)) {
    updated = updated.replace(srcRegex, `googletagmanager.com/gtag/js?id=${measurementId}`);
  }

  if (configRegex.test(updated)) {
    updated = updated.replace(configRegex, `gtag('config', '${measurementId}')`);
  }

  const measurementRegex = new RegExp(`googletagmanager\\.com/gtag/js\\?id=${measurementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (measurementRegex.test(updated)) {
    return updated;
  }

  return updated.replace(/<\/head>/i, `${snippet}\n</head>`);
}

function injectMeasurementId(filePath, measurementId) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const updated = ensureGtagSnippet(stripLegacyLoader(ensureMeasurementMeta(contents, measurementId)), measurementId);

  if (updated !== contents) {
    fs.writeFileSync(filePath, updated);
    return true;
  }

  return false;
}

function main() {
  const measurementId = getOptionalMeasurementId();
  if (!measurementId) {
    console.warn('Skipping ga:inject (GA_MEASUREMENT_ID is not set).');
    return;
  }

  const htmlFiles = walkHtmlFiles(ROOT);
  const updatedCount = htmlFiles.reduce((count, file) => {
    return injectMeasurementId(file, measurementId) ? count + 1 : count;
  }, 0);
  console.log(`Injected GA measurement ID into ${updatedCount} HTML files.`);
}

main();
