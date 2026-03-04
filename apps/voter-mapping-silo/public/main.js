const API_BASE_STORAGE_KEY = 'silo_api_base';
const state = {
  households: null,
  annotations: null,
  selected: null,
  eventVersion: 0,
  eventTimestamp: 0,
  eventSource: null,
  pendingCanvassByHousehold: new Map(),
  pendingAnnotations: new Set()
};

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

function resolveApiBases() {
  const customBase = configuredApiBase();
  const defaultBases = window.location.pathname.includes('/silo/app')
    ? ['/silo/api', '/api']
    : ['/api', '/silo/api'];
  return customBase ? [customBase, ...defaultBases] : defaultBases;
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
      const headers = { ...(opts.headers || {}) };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      const response = await fetch(endpoint, {
        ...opts,
        headers
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

function renderMap({ fitToData = false } = {}) {
  if (!state.households || !state.annotations) return;
  clusterLayer.clearLayers();
  annotationLayer.clearLayers();
  const heat = [];
  const bounds = [];

  state.households.features.forEach((f) => {
    const [lng, lat] = f.geometry.coordinates;
    heat.push([lat, lng, Math.max(1, f.properties.voter_count)]);
    bounds.push([lat, lng]);
    const marker = L.marker([lat, lng]);
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

  if (fitToData && bounds.length) {
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
  }
}

function upsertAnnotationFeature(record) {
  if (!state.annotations) return;
  const existingIndex = state.annotations.features.findIndex((feature) => feature.properties.annotation_id === record.annotation_id);
  const nextFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [record.lng, record.lat] },
    properties: record
  };
  if (existingIndex === -1) state.annotations.features.unshift(nextFeature);
  else state.annotations.features[existingIndex] = nextFeature;
}

function applyCanvassInteraction(record) {
  if (!state.households || !record?.household_id) return;
  const household = state.households.features.find((feature) => feature.properties.household_id === record.household_id);
  if (!household) return;
  household.properties.status = record.outcome;
  state.pendingCanvassByHousehold.delete(record.household_id);
}

function applyServerEvent(eventEnvelope) {
  const eventTimestamp = Date.parse(eventEnvelope.timestamp || 0) || 0;
  if (Number.isFinite(eventEnvelope.version) && eventEnvelope.version <= state.eventVersion) return;
  if (eventTimestamp && eventTimestamp < state.eventTimestamp) return;
  state.eventVersion = Math.max(state.eventVersion, Number(eventEnvelope.version) || 0);
  state.eventTimestamp = Math.max(state.eventTimestamp, eventTimestamp);

  const payload = eventEnvelope.payload || {};
  if (eventEnvelope.type === 'canvass.event_created' && payload.interaction) {
    applyCanvassInteraction(payload.interaction);
    renderMap();
    refreshDashboard().catch(() => {});
    return;
  }
  if (eventEnvelope.type === 'annotation.created' && payload.annotation) {
    upsertAnnotationFeature(payload.annotation);
    state.pendingAnnotations.delete(payload.annotation.annotation_id);
    renderMap();
    refreshDashboard().catch(() => {});
    return;
  }
  if (eventEnvelope.type === 'import.progress') {
    const importId = payload.importId || 'unknown';
    document.getElementById('importResult').textContent = `Import ${importId}: ${payload.status || 'queued'} (${safeNumber(payload.progressPct)}%) · processed ${safeNumber(payload.processedRows)} · accepted ${safeNumber(payload.acceptedRows)} · rejected ${safeNumber(payload.rejectedRows)}`;
    if (payload.status === 'completed') {
      loadFeatures({ fitToData: true }).catch(() => {});
      refreshDashboard().catch(() => {});
    }
    return;
  }
  if (eventEnvelope.type === 'import.geocode_update') {
    const importId = payload.importId || 'unknown';
    document.getElementById('importResult').textContent = `Import ${importId}: geocoding (${safeNumber(payload.progressPct)}%) · processed ${safeNumber(payload.processedRows)} · accepted ${safeNumber(payload.acceptedRows)}`;
    return;
  }
  if (eventEnvelope.type.startsWith('dataset.')) {
    loadFeatures().catch(() => {});
    refreshDashboard().catch(() => {});
  }
}

function connectEvents() {
  if (!state.token) return;
  if (state.eventSource) state.eventSource.close();
  const base = resolveApiBases()[0] || '';
  const streamUrl = `${buildEndpoint(base, '/events')}?token=${encodeURIComponent(state.token)}`;
  const source = new EventSource(streamUrl);
  state.eventSource = source;
  ['import.progress', 'import.geocode_update', 'canvass.event_created', 'annotation.created', 'dataset.cleared', 'dataset.voter_deleted', 'dataset.voter_restored']
    .forEach((type) => {
      source.addEventListener(type, (evt) => {
        try {
          applyServerEvent(JSON.parse(evt.data));
        } catch (_) {}
      });
    });
  source.onerror = () => {
    if (state.eventSource === source) {
      state.eventSource.close();
      state.eventSource = null;
      setTimeout(() => connectEvents(), 1500);
    }
  };
}

async function loadFeatures({ county, fitToData = false } = {}) {
  const mapCountyEl = document.getElementById('mapCounty');
  const selectedCounty = county || mapCountyEl.value;
  if (county && mapCountyEl.value !== county) mapCountyEl.value = county;
  const payload = await api(`/map/features?county=${encodeURIComponent(selectedCounty)}`);
  state.households = payload.households;
  state.annotations = payload.annotations;
  renderMap({ fitToData });
  return {
    households: state.households.features.length,
    annotations: state.annotations.features.length,
    county: selectedCounty
  };
}

window.logOutcome = async (householdId, outcome) => {
  const notes = prompt(`Notes for ${outcome}?`) || '';
  state.pendingCanvassByHousehold.set(householdId, { outcome, notes, at: Date.now() });
  applyCanvassInteraction({ household_id: householdId, outcome });
  renderMap();
  await api('/canvass/logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ household_id: householdId, outcome, notes })
  });
  refreshDashboard().catch(() => {});
};

map.on('click', async (e) => {
  if (!document.getElementById('annotateMode').checked) return;
  const type = document.getElementById('annotationType').value;
  const note = document.getElementById('annotationNote').value;
  const optimisticId = `optimistic-${Date.now()}`;
  state.pendingAnnotations.add(optimisticId);
  upsertAnnotationFeature({ annotation_id: optimisticId, lat: e.latlng.lat, lng: e.latlng.lng, type, note, created_by: 'local-user', created_at: new Date().toISOString() });
  renderMap();
  const created = await api('/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng, type, note })
  });
  if (state.annotations) {
    state.annotations.features = state.annotations.features.filter((feature) => feature.properties.annotation_id !== optimisticId);
  }
  upsertAnnotationFeature(created);
  renderMap();
  refreshDashboard().catch(() => {});
});

document.getElementById('loginBtn').onclick = async () => {
  try {
    const payload = await api('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey: document.getElementById('pin').value })
    });
    state.token = payload.token;
    state.eventVersion = 0;
    state.eventTimestamp = 0;
    document.getElementById('authState').textContent = 'Unlocked';
    await loadFeatures();
    await refreshDashboard();
    connectEvents();
  } catch (e) {
    alert(e.message);
  }
};

document.getElementById('refreshBtn').onclick = async () => {
  await loadFeatures({ fitToData: true });
  await refreshDashboard();
};

document.getElementById('mapCounty').onchange = async () => {
  await loadFeatures({ fitToData: true });
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


async function previewCsv(file, limit = 5) {
  const text = await file.slice(0, 128 * 1024).text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((v) => v.trim());
  const rows = lines.slice(1, limit + 1).map((line) => {
    const cols = line.split(',').map((v) => v.trim());
    return headers.reduce((acc, key, idx) => ((acc[key] = cols[idx] || ''), acc), {});
  });
  return { headers, rows };
}

async function watchImport(importId, county) {
  let attempts = 0;
  while (attempts < 180) {
    attempts += 1;
    const latest = await api(`/imports/${encodeURIComponent(importId)}`);
    document.getElementById('importResult').textContent = `Import ${importId}: ${latest.status} (${safeNumber(latest.progress_pct)}%) · processed ${safeNumber(latest.processed_rows)} · accepted ${safeNumber(latest.accepted_rows)} · rejected ${safeNumber(latest.rejected_rows)}`;
    if (latest.status === 'completed') {
      const mapLoad = await loadFeatures({ county, fitToData: true });
      document.getElementById('importResult').textContent = `Import ${importId} completed: accepted ${safeNumber(latest.accepted_rows)}, rejected ${safeNumber(latest.rejected_rows)}. Showing ${mapLoad.households} mapped households for ${mapLoad.county}.`;
      await refreshDashboard();
      return;
    }
    if (latest.status === 'failed') {
      throw new Error(latest.error || `Import ${importId} failed`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for import ${importId}`);
}

document.getElementById('importBtn').onclick = async () => {
  try {
    const file = document.getElementById('csv').files[0];
    if (!file) throw new Error('Choose a CSV first');
    const importedCounty = document.getElementById('county').value;
    const preview = await previewCsv(file, 3);
    const previewText = preview.rows.length
      ? `Preview (${preview.rows.length} rows): ${preview.rows.map((row) => Object.values(row).slice(0, 3).join(' | ')).join(' || ')}`
      : 'Preview unavailable (empty file?)';

    const formData = new FormData();
    formData.set('county', importedCounty);
    formData.set('file', file, file.name || `${importedCounty}.csv`);
    const result = await api('/imports/voters', {
      method: 'POST',
      body: formData
    });

    document.getElementById('importResult').textContent = `${previewText}. Upload queued as ${result.importId}.`;
    await watchImport(result.importId, importedCounty);
  } catch (e) {
    document.getElementById('importResult').textContent = e.message;
  }
};

document.getElementById('importRemoteBtn').onclick = async () => {
  try {
    const lines = String(document.getElementById('remoteCsvUrls').value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) throw new Error('Add at least one county,url line');
    const files = lines.map((line, idx) => {
      const [countyPart, ...urlParts] = line.split(',');
      const county = String(countyPart || '').trim().toLowerCase();
      const url = urlParts.join(',').trim();
      if (!['pierce', 'thurston'].includes(county) || !url) {
        throw new Error(`Line ${idx + 1} must be formatted as county,url`);
      }
      return { county, url, label: `remote-${idx + 1}` };
    });

    const result = await api('/imports/voters/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });

    const queued = (result.results || []).filter((item) => item.importId);
    const failed = (result.results || []).filter((item) => item.error);
    document.getElementById('importResult').textContent = `Queued ${queued.length} remote imports${failed.length ? `, failed to queue ${failed.length}` : ''}.`;
    for (const item of queued) {
      await watchImport(item.importId, item.county);
    }
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
