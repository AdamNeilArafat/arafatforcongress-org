import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'admin/field-ops-v3.html');
const jsPath = path.join(root, 'admin/field-ops-v3.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

const checks = [];

function pass(message) {
  checks.push({ ok: true, message });
  console.log(`PASS: ${message}`);
}

function fail(message) {
  checks.push({ ok: false, message });
  console.error(`FAIL: ${message}`);
}

function expectContains(source, needle, message) {
  if (source.includes(needle)) pass(message);
  else fail(message);
}

console.log('Field Ops V3 smoke test starting...');

const requiredButtons = [
  'exportFiltered',
  'exportSelected',
  'settingsBtn',
  'selectAll',
  'clearSelection',
  'batchEnrich',
  'logOutreach',
  'addTerritory',
  'addVolunteer',
  'addEvent',
  'saveSettings',
  'clearAll'
];

for (const id of requiredButtons) {
  expectContains(html, `id='${id}'`, `HTML includes #${id} button`);
}

const requiredHandlers = [
  "$('#exportFiltered').onclick=()=>exportCsv(false)",
  "$('#exportSelected').onclick=()=>exportCsv(true)",
  "$('#settingsBtn').onclick=()=>",
  "$('#selectAll').onclick=()=>",
  "$('#clearSelection').onclick=()=>",
  "$('#batchEnrich').onclick=enrichSelected",
  "$('#logOutreach').onclick=()=>",
  "$('#addTerritory').onclick=()=>",
  "$('#addVolunteer').onclick=()=>",
  "$('#addEvent').onclick=()=>",
  "$('#saveSettings').onclick=()=>",
  "$('#clearAll').onclick=()=>"
];

for (const binding of requiredHandlers) {
  expectContains(js, binding, `JS binds ${binding.split('=')[0].trim()} click handler`);
}

expectContains(js, "window.addEventListener('DOMContentLoaded',async()=>{authGate();initMap();await ingestInitial();bind();renderAll();});", 'DOMContentLoaded initializes auth, map, data, bindings, and render');

const failures = checks.filter((c) => !c.ok);
if (failures.length > 0) {
  console.error(`\nField Ops V3 smoke test failed (${failures.length} checks failed).`);
  process.exit(1);
}

console.log(`\nField Ops V3 smoke test completed successfully (${checks.length} checks).`);
