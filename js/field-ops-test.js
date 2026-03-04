const volunteerId = 'vol-test-01';
const state = {
  tab: 'map',
  walkIndex: 0,
  phoneIndex: 0,
  textIndex: 0,
  households: [
    { id: 'h1', name: 'Riley Johnson', address: '4918 Pacific Ave SE, Lacey', lat: 47.001, lng: -122.824, turf: 'WA10-TAC-014', assignedTo: volunteerId, phone: '253-555-0101', status: 'Not Attempted' },
    { id: 'h2', name: 'Jordan Lee', address: '1204 6th Ave, Olympia', lat: 47.04, lng: -122.897, turf: 'WA10-TAC-014', assignedTo: volunteerId, phone: '253-555-0102', status: 'Attempted' },
    { id: 'h3', name: 'Casey Smith', address: '8136 Canyon Rd E, Puyallup', lat: 47.183, lng: -122.317, turf: 'WA10-TAC-015', assignedTo: '', phone: '', status: 'Not Attempted' },
    { id: 'h4', name: 'Morgan Patel', address: '1102 Yelm Hwy, Olympia', lat: 47.024, lng: -122.885, turf: 'WA10-TAC-016', assignedTo: volunteerId, phone: '253-555-0103', status: 'Contacted' }
  ],
  activities: JSON.parse(localStorage.getItem('fieldOpsActivities') || '[]')
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

function logActivity(type, household, outcome, notes = '') {
  const row = { when: new Date().toISOString(), who: volunteerId, type, householdId: household?.id || 'n/a', name: household?.name || 'Area', outcome, notes };
  state.activities.unshift(row);
  localStorage.setItem('fieldOpsActivities', JSON.stringify(state.activities.slice(0, 300)));
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
    marker.on('click', () => openSheet(h));
  });
}

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
  const h = mine[state.walkIndex % mine.length];
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
    const h = mine[state.walkIndex % mine.length];
    if (!h) return;
    if (b.dataset.walk !== 'Skip') {
      h.status = b.dataset.walk;
      logActivity('KNOCK', h, b.dataset.walk);
    }
    state.walkIndex += 1;
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
    renderText();
    renderMap();
  };
  document.getElementById('text-next').onclick = () => { state.textIndex += 1; renderText(); };
  document.getElementById('csv').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.trim().split('\n').length - 1;
    document.getElementById('import-result').textContent = `Preview: ${rows} row(s) read. This test dashboard does not upload data.`;
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
