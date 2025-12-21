#!/usr/bin/env node
const path = require('path');
const fs = require('fs-extra');
const { getMeasurementId, REQUIRED_ENV } = require('./env');

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

function injectMeasurementId(filePath, measurementId) {
  const contents = fs.readFileSync(filePath, 'utf8');
  const metaRegex = /<meta[^>]*name="ga-measurement-id"[^>]*content="([^"]*)"[^>]*>/i;
  if (!metaRegex.test(contents)) {
    return false;
  }
  const updated = contents.replace(metaRegex, match => {
    return match.replace(/content="([^"]*)"/, `content="${measurementId}"`);
  });
  fs.writeFileSync(filePath, updated);
  return true;
}

function main() {
  REQUIRED_ENV.forEach(name => {
    if (!process.env[name]) {
      throw new Error(`${name} must be set before running ga:inject`);
    }
  });
  const measurementId = getMeasurementId();
  const htmlFiles = walkHtmlFiles(ROOT);
  const updatedCount = htmlFiles.reduce((count, file) => {
    return injectMeasurementId(file, measurementId) ? count + 1 : count;
  }, 0);
  console.log(`Injected GA measurement ID into ${updatedCount} HTML files.`);
}

main();
