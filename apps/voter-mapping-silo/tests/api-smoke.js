const fs = require('fs');
const assert = require('assert');
const { createServer, STORE_PATH, ensureStore } = require('../server');

async function run() {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify({ voters: [], households: [], canvassInteractions: [], mapAnnotations: [], imports: [], auditEvents: [] }, null, 2));

  process.env.SILO_ADMIN_PIN = 'Arafat_Admin_2026';
  const server = createServer().listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const req = async (url, opts = {}) => {
    const r = await fetch(base + url, opts);
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(j)}`);
    return j;
  };

  const staticReq = async (url) => {
    const r = await fetch(base + url);
    const body = await r.text();
    assert.equal(r.status, 200, `Expected 200 for ${url}, got ${r.status}`);
    assert(body.includes('Voter Mapping Silo'));
  };

  await staticReq('/');
  await staticReq('/app');
  await staticReq('/app/');
  await staticReq('/silo/app/');

  const health = await req('/silo/api/health');
  assert.equal(health.ok, true);

  const login = await req('/silo/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: 'Arafat_Admin_2026' })
  });
  assert(login.token);
  const authHeaders = { Authorization: `Bearer ${login.token}` };

  const csv = `voter_id,first_name,last_name,address,city,state,zip,party\n1,Ada,Lovelace,100 Main St,Tacoma,WA,98402,DEM\n2,Grace,Hopper,100 Main St,Tacoma,WA,98402,DEM\n3,Alan,Turing,200 Pine St,Olympia,WA,98501,IND`;
  const importResp = await req('/silo/api/imports/voters', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ county: 'pierce', csv })
  });
  assert.equal(importResp.accepted, 3);

  const features = await req('/silo/api/map/features?county=all', { headers: authHeaders });
  assert.equal(features.households.features.length, 2);

  const hhId = features.households.features[0].properties.household_id;
  await req('/silo/api/canvass/logs', {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ household_id: hhId, outcome: 'Contacted' })
  });

  await req('/silo/api/annotations', {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 47.0, lng: -122.9, type: 'issue', note: 'Street light out' })
  });

  const dashboard = await req('/silo/api/dashboard', { headers: authHeaders });
  assert.equal(dashboard.voters, 3);
  assert.equal(dashboard.households, 2);
  assert.equal(dashboard.interactions, 1);
  assert.equal(dashboard.annotations, 1);
  assert(dashboard.dataQuality);
  assert.equal(typeof dashboard.dataQuality.deterministicGeocodes, 'number');
  assert(dashboard.liveFeed);
  assert.equal(dashboard.liveFeed.source, 'campaign-live-feed');
  assert(dashboard.volunteerDashboard);
  assert.equal(dashboard.volunteerDashboard.source, 'volunteer-dashboard-sync');
  assert.equal(typeof dashboard.volunteerDashboard.totalVolunteers, 'number');

  server.close();
  console.log('api-smoke ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
