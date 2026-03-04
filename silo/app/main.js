const API_BASE_STORAGE_KEY = 'silo_api_base';
const state = { households: null, annotations: null, selected: null };

function normalizeApiBase(value) {
  const trimmed = String(value || '').trim();
  return trimmed.replace(/\/$/, '');
}

function configuredApiBase() {
  const params = new URLSearchParams(window.location.search);
  const queryBase = normalizeApiBase(params.get('apiBase') || params.get('api_base') || params.get('siloApi'));
  if (queryBase) {
    localStorage.setItem(API_BASE_STORAGE_KEY, queryBase);
    return queryBase;
  }
  return normalizeApiBase(localStorage.getItem(API_BASE_STORAGE_KEY));
}

function withApiSuffix(base) {
  if (!base) return '';
  return base.endsWith('/api') ? base : `${base}/api`;
}

function resolveApiBases() {
  const customBase = configuredApiBase();
  const defaultBases = window.location.pathname.includes('/silo/app')
    ? ['/silo/api', '/api']
    : ['/api', '/silo/api'];
  if (!customBase) return defaultBases;
  const candidates = [customBase, withApiSuffix(customBase), ...defaultBases];
  return [...new Set(candidates.filter(Boolean))];
}

const map = L.map('map').setView([47.03, -122.85], 9);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
const heatLayer = L.heatLayer([], { radius: 25, blur: 20, maxZoom: 14 }).addTo(map);
const clusterLayer = L.markerClusterGroup();
const annotationLayer = L.layerGroup().addTo(map);
map.addLayer(clusterLayer);

function buildEndpoint(base, path) {
  if (path.startsWith('http')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 160) || `HTTP ${response.status}` };
  }
}

async function api(path, opts = {}) {
  const bases = path.startsWith('http') ? [''] : resolveApiBases();
  let lastError = null;
  let sawMethodNotAllowed = false;

  for (const base of bases) {
    const endpoint = buildEndpoint(base, path);
    try {
      const response = await fetch(endpoint, {
        ...opts,
        headers: { ...(opts.headers || {}) }
      });
      const payload = await parsePayload(response);
      if (!response.ok) {
        if (response.status === 405) sawMethodNotAllowed = true;
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  if (sawMethodNotAllowed) {
    throw new Error('Unlock failed with HTTP 405. The silo API route is not accepting POST requests. Save the correct API base URL and try again.');
  }
  if (lastError && String(lastError.message || '').includes('expected pattern')) {
    throw new Error('Could not reach the dashboard API. Reload the page and verify the dashboard URL.');
  }
  throw lastError || new Error('API request failed');
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function showKpis(data) {
  document.getElementById('kpis').innerHTML = [
    ['Voters', data.voters],
    ['Households', data.households],
    ['Interactions', data.interactions],
    ['Annotations', data.annotations]
  ].map(([k, v]) => `<div class="card"><strong>${safeNumber(v)}</strong><div class="muted">${k}</div></div>`).join('');
}

function showDataQuality(quality = {}) {
  const latestImport = quality.latestImportAt ? new Date(quality.latestImportAt).toLocaleString() : 'None yet';
  const noteCoverage = Number.isFinite(quality.interactionNoteCoveragePct)
    ? `${quality.interactionNoteCoveragePct}%`
    : 'No interactions yet';

  document.getElementById('dataQuality').innerHTML = [
    `Deterministic geocodes (review recommended): <strong>${safeNumber(quality.deterministicGeocodes)}</strong>`,
    `CSV geocodes: <strong>${safeNumber(quality.csvGeocodes)}</strong>`,
    `Interaction note coverage: <strong>${noteCoverage}</strong>`,
    `Latest import: <strong>${latestImport}</strong>`,
    `Latest reject rate: <strong>${Number.isFinite(quality.latestImportRejectRatePct) ? `${quality.latestImportRejectRatePct}%` : 'N/A'}</strong>`
  ].join('<br>');
}

function showLiveFeed(liveFeed = {}) {
  const metrics = liveFeed.publicMetrics || {};
  const outreach = liveFeed.outreachData || {};
  const staleFlag = outreach.stale ? '⚠️ Possibly stale' : '✅ Fresh';

  document.getElementById('liveFeedKpis').innerHTML = [
    ['Live Doors', metrics.doorsKnocked],
    ['Live Calls', metrics.callsMade],
    ['Live Texts', metrics.textsSent],
    ['Outreach Contacts', outreach.totalOutreachContacts]
  ].map(([k, v]) => `<div class="card"><strong>${safeNumber(v)}</strong><div class="muted">${k}</div></div>`).join('');

  const metricsUpdated = metrics.lastUpdated ? new Date(metrics.lastUpdated).toLocaleString() : 'Unavailable';
  const outreachPull = outreach.dataPullDate ? new Date(outreach.dataPullDate).toLocaleString() : 'Unavailable';

  document.getElementById('liveFeedMeta').innerHTML = [
    `Feed source: <strong>${liveFeed.source || 'Unknown'}</strong>`,
    `Public metrics updated: <strong>${metricsUpdated}</strong>`,
    `Outreach pull date: <strong>${outreachPull}</strong>`,
    `Feed freshness: <strong>${staleFlag}</strong>`,
    outreach.staleReason ? `Stale reason: <strong>${outreach.staleReason}</strong>` : ''
  ].filter(Boolean).join('<br>');
}

function showVolunteerBridge(volunteerDashboard = {}) {
  const pullDate = volunteerDashboard.dataPullDate
    ? new Date(volunteerDashboard.dataPullDate).toLocaleString()
    : 'Unavailable';
  const staleState = volunteerDashboard.stale ? '⚠️ Stale' : '✅ Synced';
  const skillSummary = Object.entries(volunteerDashboard.skillsBreakdown || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${label}: ${safeNumber(count)}`)
    .join(' · ');

  document.getElementById('volunteerBridgeKpis').innerHTML = [
    ['Volunteers', volunteerDashboard.totalVolunteers],
    ['Active', volunteerDashboard.activeVolunteers]
  ].map(([k, v]) => `<div class="card"><strong>${safeNumber(v)}</strong><div class="muted">${k}</div></div>`).join('');

  document.getElementById('volunteerBridgeMeta').innerHTML = [
    `Source: <strong>${volunteerDashboard.source || 'Unknown'}</strong>`,
    `Data pull date: <strong>${pullDate}</strong>`,
    `Sync health: <strong>${staleState}</strong>`,
    skillSummary ? `Top skills: <strong>${skillSummary}</strong>` : 'Top skills: <strong>No skills published yet</strong>'
  ].join('<br>');

  const adminLink = volunteerDashboard.adminPath || '/admin/volunteer-dashboard.html';
  const directLink = document.getElementById('openVolunteerDashboard');
  directLink.href = adminLink;
  const setupLink = document.getElementById('openVolunteerSetup');
  if (setupLink) setupLink.href = `${adminLink}#settings-panel`;
}

async function refreshDashboard() {
  const d = await api('/dashboard');
  showKpis(d);
  showDataQuality(d.dataQuality);
  showLiveFeed(d.liveFeed);
  showVolunteerBridge(d.volunteerDashboard);
  const audit = await api('/audit');
  document.getElementById('audit').innerHTML = audit.slice(0, 8).map((a) => `${new Date(a.timestamp).toLocaleString()} · ${a.action}`).join('<br>');
}

function renderMap() {
  clusterLayer.clearLayers();
  annotationLayer.clearLayers();
  const heat = [];

  state.households.features.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;
    heat.push([lat, lng, Math.max(1, f.properties.voter_count)]);
    const marker = L.circleMarker([lat, lng], {
      radius: Math.min(14, 4 + Math.max(1, f.properties.voter_count)),
      weight: 1,
      color: '#1346a5',
      fillColor: '#2f6ad8',
      fillOpacity: 0.82
    });
    marker.bindPopup(`
      <strong>${f.properties.normalized_address}</strong><br>
      Voters: ${f.properties.voter_count}<br>
      Status: ${f.properties.status}<br>
      <button onclick="window.logOutcome('${f.properties.household_id}','Contacted')">Mark Contacted</button>
      <button onclick="window.logOutcome('${f.properties.household_id}','Not Home')">Mark Not Home</button>
      <button onclick="window.logOutcome('${f.properties.household_id}','Supporter')">Mark Supporter</button>
    `);
    clusterLayer.addLayer(marker);
  });

  state.annotations.features.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;
    const marker = L.circleMarker([lat, lng], { radius: 7, color: '#c026d3' }).bindPopup(`<strong>${f.properties.type}</strong><br>${f.properties.note || ''}`);
    annotationLayer.addLayer(marker);
  });

  heatLayer.setLatLngs(heat);
  const showHeat = map.getZoom() <= 12;
  if (showHeat) {
    if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
    if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
  } else {
    if (!map.hasLayer(clusterLayer)) map.addLayer(clusterLayer);
    if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);
  }
}

async function loadFeatures() {
  const county = document.getElementById('mapCounty').value;
  const payload = await api(`/map/features?county=${encodeURIComponent(county)}`);
  state.households = payload.households;
  state.annotations = payload.annotations;
  renderMap();
}

map.on('zoomend', () => {
  if (state.households && state.annotations) renderMap();
});

window.logOutcome = async (householdId, outcome) => {
  const notes = prompt(`Notes for ${outcome}?`) || '';
  await api('/canvass/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ household_id: householdId, outcome, notes })
  });
  await loadFeatures();
  await refreshDashboard();
};

map.on('click', async (e) => {
  if (!document.getElementById('annotateMode').checked) return;
  const type = document.getElementById('annotationType').value;
  const note = document.getElementById('annotationNote').value;
  await api('/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng, type, note })
  });
  await loadFeatures();
  await refreshDashboard();
});


document.getElementById('refreshBtn').onclick = async () => {
  await loadFeatures();
  await refreshDashboard();
};

document.getElementById('importBtn').onclick = async () => {
  try {
    const file = document.getElementById('csv').files[0];
    if (!file) throw new Error('Choose a CSV first');
    const csv = await file.text();
    const result = await api('/imports/voters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county: document.getElementById('county').value, csv })
    });
    document.getElementById('importResult').textContent = `Import ${result.importId}: accepted ${result.accepted}, rejected ${result.rejected}`;
    await loadFeatures();
    await refreshDashboard();
  } catch (e) {
    document.getElementById('importResult').textContent = e.message;
  }
};



const apiBaseInput = document.getElementById('apiBase');
if (apiBaseInput) apiBaseInput.value = configuredApiBase();

document.getElementById('saveApiBaseBtn').onclick = () => {
  const nextBase = normalizeApiBase(document.getElementById('apiBase').value);
  if (!nextBase) {
    localStorage.removeItem(API_BASE_STORAGE_KEY);
    document.getElementById('authState').textContent = 'Open (default API route)';
    return;
  }
  localStorage.setItem(API_BASE_STORAGE_KEY, nextBase);
  document.getElementById('authState').textContent = 'Open (custom API route saved)';
};

async function initDashboard() {
  try {
    await loadFeatures();
    await refreshDashboard();
  } catch (error) {
    document.getElementById('authState').textContent = `Open (${error.message})`;
  }
}

initDashboard().catch(() => {});
