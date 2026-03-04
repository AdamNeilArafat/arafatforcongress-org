const volunteerId = 'vol-test-01';
const HOUSEHOLD_STORAGE_KEY = 'fieldOpsHouseholds';
const ACTIVITY_STORAGE_KEY = 'fieldOpsActivities';
const IMPORT_META_STORAGE_KEY = 'fieldOpsImportMeta';
const DEFAULT_HOUSEHOLDS = [
  { id: 'h1', name: 'Riley Johnson', address: '4918 Pacific Ave SE, Lacey', lat: 47.001, lng: -122.824, turf: 'WA10-TAC-014', assignedTo: volunteerId, phone: '253-555-0101', status: 'Not Attempted' },
  { id: 'h2', name: 'Jordan Lee', address: '1204 6th Ave, Olympia', lat: 47.04, lng: -122.897, turf: 'WA10-TAC-014', assignedTo: volunteerId, phone: '253-555-0102', status: 'Attempted' },
  { id: 'h3', name: 'Casey Smith', address: '8136 Canyon Rd E, Puyallup', lat: 47.183, lng: -122.317, turf: 'WA10-TAC-015', assignedTo: '', phone: '', status: 'Not Attempted' },
  { id: 'h4', name: 'Morgan Patel', address: '1102 Yelm Hwy, Olympia', lat: 47.024, lng: -122.885, turf: 'WA10-TAC-016', assignedTo: volunteerId, phone: '253-555-0103', status: 'Contacted' }
];

const state = {
  tab: 'map',
  walkIndex: 0,
  phoneIndex: 0,
  textIndex: 0,
  households: loadHouseholds(),
  activities: JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || '[]')
};

const tabs = [
  ['map', 'Map'],
  ['walk', 'Walk Lists'],
  ['flyer', 'Flyer Runs'],
  ['phone', 'Phone Bank'],
  ['text', 'Text Bank'],
  ['mapping', 'Voter Mapping'],
  ['imports', 'Admin Imports'],
  ['reporting', 'Reporting']
];

const map = L.map('map').setView([47.03, -122.84], 10);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

function stableHash(text = '') {
  let hash = 2166136261;
  const str = String(text);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function deterministicGeo(address = '') {
  const hash = stableHash(address);
  const lat = 47.03 + ((hash % 2000) - 1000) / 10000;
  const lng = -122.84 + (((hash >>> 11) % 2400) - 1200) / 10000;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function householdPopupHtml(h) {
  const details = [
    `<strong>${h.name || 'Unknown'}</strong>`,
    h.address || '',
    h.phone ? `Phone: ${h.phone}` : '',
    h.email ? `Email: ${h.email}` : '',
    h.party ? `Party: ${h.party}` : '',
    `Status: ${h.status || 'Not Attempted'}`
  ].filter(Boolean).join('<br>');
  return `${details}<br><button class="btn" onclick="window.openFieldOpsHousehold('${h.id}')">Open Actions</button>`;
}

function loadHouseholds() {
  const saved = localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
  if (!saved) return DEFAULT_HOUSEHOLDS.map((row) => ({ ...row }));
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_HOUSEHOLDS.map((row) => ({ ...row }));
  } catch {
    return DEFAULT_HOUSEHOLDS.map((row) => ({ ...row }));
  }
}

function saveHouseholds() {
  localStorage.setItem(HOUSEHOLD_STORAGE_KEY, JSON.stringify(state.households));
}

function saveImportMeta(meta) {
  if (!meta) {
    localStorage.removeItem(IMPORT_META_STORAGE_KEY);
    return;
  }
  localStorage.setItem(IMPORT_META_STORAGE_KEY, JSON.stringify(meta));
}

function loadImportMeta() {
  try {
    const raw = localStorage.getItem(IMPORT_META_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeHeader(name = '') {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCsvLine(line = '') {
  const cols = [];
  let value = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === ',' && !inQuote) {
      cols.push(value);
      value = '';
    } else {
      value += c;
    }
  }
  cols.push(value);
  return cols.map((part) => part.trim());
}

function parseCsvRows(csvText = '') {
  const lines = String(csvText).split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, idx) => {
      const value = values[idx] || '';
      const letter = idx < 26 ? String.fromCharCode(97 + idx) : '';
      if (header) row[header] = value;
      if (letter) {
        row[`col_${letter}`] = value;
        row[letter] = value;
      }
      return row;
    }, {});
  });
}

function first(row, keys, fallback = '') {
  for (const key of keys) {
    const value = row[key];
    if (value && String(value).trim()) return String(value).trim();
  }

  const rowKeys = Object.keys(row);
  let bestMatch = null;
  const normalizeForCompare = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const levenshteinDistance = (left = '', right = '') => {
    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let r = 0; r < rows; r += 1) matrix[r][0] = r;
    for (let c = 0; c < cols; c += 1) matrix[0][c] = c;

    for (let r = 1; r < rows; r += 1) {
      for (let c = 1; c < cols; c += 1) {
        const cost = left[r - 1] === right[c - 1] ? 0 : 1;
        matrix[r][c] = Math.min(
          matrix[r - 1][c] + 1,
          matrix[r][c - 1] + 1,
          matrix[r - 1][c - 1] + cost
        );
      }
    }

    return matrix[left.length][right.length];
  };

  keys.forEach((targetKey) => {
    const target = normalizeForCompare(targetKey);
    if (target.length < 4) return;

    rowKeys.forEach((candidateKey) => {
      const candidate = normalizeForCompare(candidateKey);
      if (candidate.length < 4) return;
      const distance = levenshteinDistance(target, candidate);
      const similarity = 1 - (distance / Math.max(target.length, candidate.length));
      if (distance <= 3 && similarity >= 0.72 && (!bestMatch || similarity > bestMatch.similarity)) {
        const value = row[candidateKey];
        if (value && String(value).trim()) {
          bestMatch = { value: String(value).trim(), similarity };
        }
      }
    });
  });

  if (bestMatch) return bestMatch.value;
  return fallback;
}

function composeStreet(row = {}) {
  const directStreet = first(row, [
    'address',
    'combined_address',
    'address_combined',
    'full_address',
    'street',
    'street_address',
    'address_1',
    'address1',
    'street1',
    'res_address',
    'regaddress',
    'regaddress1',
    'address_line_1',
    'residence_address',
    'voter_address',
    'col_s',
    's',
    'mail1',
    'mailing_address'
  ]);
  if (directStreet) return directStreet;

  const registrationStreet = [
    first(row, ['regstnum']),
    first(row, ['regstfrac']),
    first(row, ['regstpredirection']),
    first(row, ['regstname']),
    first(row, ['regsttype']),
    first(row, ['regstpostdirection']),
    first(row, ['regunittype']),
    first(row, ['regstunitnum'])
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  return registrationStreet;
}

function csvRowsToHouseholds(rows = []) {
  const accepted = [];
  const rejected = [];

  rows.forEach((row, idx) => {
    const street = composeStreet(row);
    const city = first(row, ['city', 'town', 'regcity', 'mailcity']);
    const stateCode = first(row, ['state', 'st', 'regstate', 'mailstate']);
    const zip = first(row, ['zip', 'zip_code', 'postal', 'postal_code', 'regzipcode', 'mailzip', 'zip_code_5']);
    const address = [street, city, stateCode, zip].filter(Boolean).join(', ');
    if (!address) {
      rejected.push(`Row ${idx + 2}: missing address column/value`);
      return;
    }

    const latValue = Number(first(row, ['lat', 'latitude']));
    const lngValue = Number(first(row, ['lng', 'lon', 'long', 'longitude']));
    const geocoded = Number.isFinite(latValue) && Number.isFinite(lngValue)
      ? { lat: latValue, lng: lngValue }
      : deterministicGeo(address);

    const name = first(row, ['name', 'full_name'], '').trim();
    const firstName = first(row, ['first_name', 'firstname'], '').trim();
    const lastName = first(row, ['last_name', 'lastname'], '').trim();

    accepted.push({
      id: first(row, ['id', 'household_id', 'voter_id'], `import-${Date.now()}-${idx}`),
      name: name || `${firstName} ${lastName}`.trim() || `Imported Household ${idx + 1}`,
      address,
      lat: geocoded.lat,
      lng: geocoded.lng,
      turf: first(row, ['turf', 'precinct', 'district'], 'Imported'),
      assignedTo: first(row, ['assigned_to', 'assignedto'], ''),
      phone: first(row, ['phone', 'phone_number', 'mobile'], ''),
      email: first(row, ['email', 'email_address'], ''),
      party: first(row, ['party', 'party_affiliation'], ''),
      status: first(row, ['status'], 'Not Attempted')
    });
  });

  return { accepted, rejected };
}

function normalizeGoogleSheetCsvUrl(input = '') {
  const raw = String(input).trim();
  if (!raw) return '';
  if (raw.includes('/export?format=csv')) {
    const gidMatch = raw.match(/[?&#]gid=([0-9]+)/);
    if (gidMatch) return raw;
    const hashGidMatch = raw.match(/#gid=([0-9]+)/);
    if (hashGidMatch) return `${raw}${raw.includes('?') ? '&' : '?'}gid=${hashGidMatch[1]}`;
    return raw;
  }

  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return raw;

  const gidMatch = raw.match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

async function importCsvText(csvText, sourceLabel) {
  const parsedRows = parseCsvRows(csvText);
  if (!parsedRows.length) {
    document.getElementById('import-result').textContent = `No rows found in ${sourceLabel}.`;
    return;
  }

  const { accepted, rejected } = csvRowsToHouseholds(parsedRows);
  if (!accepted.length) {
    document.getElementById('import-result').textContent = `0 imported from ${sourceLabel}. ${rejected.slice(0, 4).join(' | ')}`;
    return;
  }

  state.households = accepted;
  state.walkIndex = 0;
  state.phoneIndex = 0;
  state.textIndex = 0;
  saveHouseholds();
  saveImportMeta({
    source: sourceLabel,
    count: accepted.length,
    importedAt: new Date().toISOString()
  });

  const rejectText = rejected.length ? ` Rejected ${rejected.length}: ${rejected.slice(0, 3).join(' | ')}` : '';
  logActivity('IMPORT', null, `Imported ${accepted.length} households`, `${sourceLabel}.${rejectText ? ` ${rejectText.trim()}` : ''}`.trim());

  setTab('map');
  renderMap();
  renderWalk();
  renderPhone();
  renderText();
  renderKpis();
  renderReporting();

  document.getElementById('import-result').textContent = `Saved ${accepted.length} household(s) from ${sourceLabel}.${rejectText}`;
}

function renderSavedImportNotice() {
  const meta = loadImportMeta();
  if (!meta || !meta.count) return;
  const savedAt = meta.importedAt ? new Date(meta.importedAt).toLocaleString() : 'an earlier session';
  document.getElementById('import-result').textContent = `Loaded saved upload: ${meta.count} household(s) from ${meta.source || 'CSV'} (${savedAt}). Use “Reset to Demo Data” to clear.`;
}

function logActivity(type, household, outcome, notes = '') {
  const row = { when: new Date().toISOString(), who: volunteerId, type, householdId: household?.id || 'n/a', name: household?.name || 'Area', outcome, notes };
  state.activities.unshift(row);
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(state.activities.slice(0, 300)));
  saveHouseholds();
  renderActivity();
  renderKpis();
  renderReporting();
}

function renderTabs() {
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = tabs.map(([key, label]) => `<button class="tab ${state.tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('');
  wrap.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
}

function setTab(tab) {
  state.tab = tab;
  renderTabs();
  document.querySelectorAll('[id^="panel-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(`panel-${tab}`)?.classList.remove('hidden');
}

function filteredHouseholds() {
  const assignment = document.getElementById('filter-assignment')?.value || 'all';
  const status = document.getElementById('filter-status')?.value || 'all';
  return state.households.filter(h => {
    if (assignment === 'mine' && h.assignedTo !== volunteerId) return false;
    if (assignment === 'unassigned' && h.assignedTo) return false;
    if (status !== 'all' && h.status !== status) return false;
    return true;
  });
}

function renderMap() {
  markerLayer.clearLayers();
  filteredHouseholds().forEach(h => {
    const marker = L.marker([h.lat, h.lng]).addTo(markerLayer);
    marker.bindPopup(householdPopupHtml(h));
    marker.on('click', () => marker.openPopup());
  });
}

window.openFieldOpsHousehold = (id) => {
  const household = state.households.find((h) => String(h.id) === String(id));
  if (household) openSheet(household);
};

function openSheet(h) {
  const sheet = document.getElementById('bottom-sheet');
  sheet.classList.add('open');
  sheet.innerHTML = `<h3>${h.name}</h3><p>${h.address}</p><p class="muted">Last outcome: ${h.status}</p>
    <div class="actions">
      <button class="btn" data-a="Attempted">Knock Attempt</button>
      <button class="btn primary" data-a="Contacted">Contact Made</button>
      <button class="btn" data-a="Flyer Dropped">Flyer Dropped</button>
      <button class="btn warn" data-a="Do Not Contact">Do Not Contact</button>
    </div>
    <textarea id="sheet-note" placeholder="Add note"></textarea>
    <button class="btn" id="sheet-close">Close</button>`;
  sheet.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => {
    h.status = btn.dataset.a;
    logActivity(btn.dataset.a === 'Do Not Contact' ? 'DNC' : 'KNOCK', h, btn.dataset.a, sheet.querySelector('#sheet-note').value.trim());
    renderMap();
    sheet.classList.remove('open');
  }));
  sheet.querySelector('#sheet-close').onclick = () => sheet.classList.remove('open');
}

function renderWalk() {
  const mine = state.households.filter(h => h.assignedTo === volunteerId);
  const h = mine[state.walkIndex % Math.max(1, mine.length)];
  document.getElementById('walk-card').innerHTML = `<strong>${h?.name || 'No homes assigned'}</strong><div>${h?.address || ''}</div><div class="muted">Turf ${h?.turf || ''}</div>`;
}

function renderPhone() {
  const queue = state.households.filter(h => h.phone && h.status !== 'Do Not Contact');
  const h = queue[state.phoneIndex % Math.max(1, queue.length)];
  document.getElementById('phone-card').innerHTML = h ? `<strong>${h.name}</strong><div>${h.phone}</div><div>${h.address}</div>` : 'No callable contacts';
  const outcomes = ['No Answer', 'Left VM', 'Talked', 'Wrong Number', 'DNC'];
  document.getElementById('phone-actions').innerHTML = outcomes.map(o => `<button class="btn ${o === 'Talked' ? 'primary' : ''}" data-phone="${o}">${o}</button>`).join('');
  document.querySelectorAll('[data-phone]').forEach(b => b.onclick = () => {
    if (!h) return;
    if (b.dataset.phone === 'DNC') h.status = 'Do Not Contact';
    logActivity('PHONE_CALL', h, b.dataset.phone, document.getElementById('phone-note').value.trim());
  });
}

function renderText() {
  const enabled = document.getElementById('text-enable').checked;
  document.getElementById('text-controls').classList.toggle('hidden', !enabled);
  if (!enabled) return;
  const queue = state.households.filter(h => h.phone && h.status !== 'Do Not Contact');
  const h = queue[state.textIndex % Math.max(1, queue.length)];
  document.getElementById('text-card').innerHTML = h ? `<strong>${h.name}</strong><div>${h.phone}</div>` : 'No textable contacts';
}

function renderActivity() {
  const root = document.getElementById('activity');
  root.innerHTML = state.activities.map(a => `<div class="row"><span>${new Date(a.when).toLocaleString()} · ${a.type}</span><span>${a.outcome} · ${a.name}</span></div>`).join('') || '<p class="muted">No activity yet.</p>';
}

function renderKpis() {
  const doors = state.activities.filter(a => ['KNOCK', 'DNC'].includes(a.type)).length;
  const contacts = state.activities.filter(a => a.outcome === 'Contacted' || a.outcome === 'Talked').length;
  const flyers = state.activities.filter(a => a.outcome === 'Flyer Dropped').length;
  const dnc = state.households.filter(h => h.status === 'Do Not Contact').length;
  const turfsDone = new Set(state.households.filter(h => h.status !== 'Not Attempted').map(h => h.turf)).size;
  document.getElementById('kpis').innerHTML = [
    ['Doors Attempted', doors], ['Contacts', contacts], ['Flyers Dropped', flyers], ['DNC', dnc], ['Turfs Active', turfsDone]
  ].map(([k, v]) => `<div class="card"><div class="count">${v}</div><div class="muted">${k}</div></div>`).join('');
}

function renderReporting() {
  const byType = state.activities.reduce((acc, a) => ((acc[a.type] = (acc[a.type] || 0) + 1), acc), {});
  document.getElementById('report-list').innerHTML = Object.entries(byType).map(([k, v]) => `<div class="item"><strong>${k}</strong><div class="muted">${v} logged actions</div></div>`).join('') || '<p class="muted">No reports yet.</p>';
}

function wireEvents() {
  document.getElementById('filter-assignment').addEventListener('change', renderMap);
  document.getElementById('filter-status').addEventListener('change', renderMap);
  document.querySelectorAll('[data-walk]').forEach(b => b.addEventListener('click', () => {
    const mine = state.households.filter(h => h.assignedTo === volunteerId);
    const h = mine[state.walkIndex % Math.max(1, mine.length)];
    if (!h) return;
    if (b.dataset.walk !== 'Skip') {
      h.status = b.dataset.walk;
      logActivity('KNOCK', h, b.dataset.walk);
    }
    state.walkIndex += 1;
    saveHouseholds();
    renderWalk();
    renderMap();
  }));
  document.getElementById('walk-next').onclick = () => { state.walkIndex += 1; renderWalk(); };
  document.getElementById('flyer-address').onclick = () => {
    const mine = state.households.filter(h => h.assignedTo === volunteerId)[state.walkIndex % 2];
    if (!mine) return;
    mine.status = 'Flyer Dropped';
    logActivity('FLYER_DROP', mine, 'Flyer Dropped');
    document.getElementById('flyer-status').textContent = `${mine.address} marked complete.`;
    renderMap();
  };
  document.getElementById('flyer-block').onclick = () => { logActivity('FLYER_DROP', null, 'Street/block complete'); document.getElementById('flyer-status').textContent = 'Street/block marked complete.'; };
  document.getElementById('flyer-area').onclick = () => { logActivity('FLYER_DROP', null, 'Area complete'); document.getElementById('flyer-status').textContent = 'Area marked complete.'; };
  document.getElementById('phone-next').onclick = () => { state.phoneIndex += 1; renderPhone(); };
  document.getElementById('text-enable').onchange = renderText;
  document.getElementById('send-text').onclick = () => {
    const queue = state.households.filter(h => h.phone && h.status !== 'Do Not Contact');
    const h = queue[state.textIndex % Math.max(1, queue.length)];
    if (!h) return;
    logActivity('TEXT', h, 'Sent', document.getElementById('text-msg').value);
  };
  document.getElementById('text-optout').onclick = () => {
    const queue = state.households.filter(h => h.phone && h.status !== 'Do Not Contact');
    const h = queue[state.textIndex % Math.max(1, queue.length)];
    if (!h) return;
    h.status = 'Do Not Contact';
    logActivity('DNC', h, 'STOP/DNC');
    saveHouseholds();
    renderText();
    renderMap();
  };
  document.getElementById('text-next').onclick = () => { state.textIndex += 1; renderText(); };

  document.getElementById('csv').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importCsvText(await file.text(), `file ${file.name}`);
  });

  document.getElementById('import-sheet-url').addEventListener('click', async () => {
    const rawUrl = document.getElementById('sheet-url').value;
    const csvUrl = normalizeGoogleSheetCsvUrl(rawUrl);
    if (!csvUrl) {
      document.getElementById('import-result').textContent = 'Paste a Google Sheet URL first.';
      return;
    }
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const csvText = await response.text();
      await importCsvText(csvText, 'Google Sheet');
    } catch (error) {
      document.getElementById('import-result').textContent = `Unable to load Google Sheet CSV: ${error.message}`;
    }
  });

  document.getElementById('reset-imported').addEventListener('click', () => {
    state.households = DEFAULT_HOUSEHOLDS.map((row) => ({ ...row }));
    saveImportMeta(null);
    saveHouseholds();
    logActivity('IMPORT', null, 'Import reset', 'Restored default test households.');
    renderMap();
    renderWalk();
    renderPhone();
    renderText();
    renderKpis();
    renderReporting();
    document.getElementById('import-result').textContent = 'Saved import cleared. Restored default test households.';
  });
}

renderTabs();
setTab('map');
wireEvents();
renderMap();
renderWalk();
renderPhone();
renderText();
renderActivity();
renderKpis();
renderReporting();
renderSavedImportNotice();
