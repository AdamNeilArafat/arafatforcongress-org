const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
const { createServer, STORE_PATH, ensureStore } = require('../server');

async function run() {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify({
    voters: [],
    households: [],
    canvassInteractions: [],
    mapAnnotations: [],
    imports: [],
    turfAssignments: [],
    users: [],
    auditEvents: [],
    settings: {}
  }, null, 2));

  const adminKey = `admin-${crypto.randomUUID()}`;
  process.env.SILO_ADMIN_SECRET = adminKey;
  process.env.SILO_ROLE_CREDENTIALS = JSON.stringify({ volunteerkey: 'volunteer' });

  const server = createServer().listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const req = async (url, opts = {}, expectedStatus = 200) => {
    const r = await fetch(base + url, opts);
    const j = await r.json();
    assert.equal(r.status, expectedStatus, `${url}: expected ${expectedStatus}, got ${r.status} ${JSON.stringify(j)}`);
    return j;
  };

  const adminLogin = await req('/silo/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey: adminKey })
  });
  assert.equal(adminLogin.role, 'admin');
  const adminHeaders = { Authorization: `Bearer ${adminLogin.token}` };

  const importForm = new FormData();
  importForm.set('county', 'pierce');
  importForm.set('file', new Blob([`voter_id,first_name,last_name,address,city,state,zip,party\n1,Ada,Lovelace,100 Main St,Tacoma,WA,98402,DEM\n2,Grace,Hopper,100 Main St,Tacoma,WA,98402,DEM\n3,Alan,Turing,200 Pine St,Olympia,WA,98501,IND`], { type: 'text/csv' }), 'voters.csv');
  const importRes = await req('/silo/api/imports/voters', { method: 'POST', headers: adminHeaders, body: importForm }, 202);
  assert(importRes.importId);

  await new Promise((resolve) => setTimeout(resolve, 150));

  const featuresAdmin = await req('/silo/api/map/features?county=all', { headers: adminHeaders });
  assert.equal(featuresAdmin.households.features.length, 2);
  const householdIds = featuresAdmin.households.features.map((feature) => feature.properties.household_id);

  const assignment = await req('/silo/api/assignments', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'volunteer-1', county: 'pierce', household_ids: [householdIds[0]] })
  }, 201);
  assert.equal(assignment.user_id, 'volunteer-1');

  const volunteerLogin = await req('/silo/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey: 'volunteerkey' })
  });
  assert.equal(volunteerLogin.role, 'volunteer');
  const volunteerHeaders = { Authorization: `Bearer ${volunteerLogin.token}` };

  const denyImport = await req('/silo/api/imports', { headers: volunteerHeaders }, 403);
  assert(denyImport.error.includes('admin only'));

  const volunteerFeatures = await req('/silo/api/map/features?county=all', { headers: volunteerHeaders });
  assert.equal(volunteerFeatures.households.features.length, 0, 'Role-map volunteer should have no assignment');

  const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  store.users.push({ user_id: 'volunteer-1', username: 'volunteer@example.com', role: 'volunteer', accessKeyHash: crypto.createHash('sha256').update('volpass').digest('hex') });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));

  const assignedVolunteerLogin = await req('/silo/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'volunteer@example.com', accessKey: 'volpass' })
  });
  const assignedVolunteerHeaders = { Authorization: `Bearer ${assignedVolunteerLogin.token}` };

  const assignedFeatures = await req('/silo/api/map/features?county=all', { headers: assignedVolunteerHeaders });
  assert.equal(assignedFeatures.households.features.length, 1);
  const voterPayload = assignedFeatures.households.features[0].properties.voters[0];
  assert.deepEqual(Object.keys(voterPayload).sort(), ['first_name', 'last_name', 'party', 'voter_id']);

  await req('/silo/api/canvass/logs', {
    method: 'POST',
    headers: { ...assignedVolunteerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ household_id: householdIds[0], outcome: 'Contacted' })
  }, 200);

  const outOfScope = await req('/silo/api/canvass/logs', {
    method: 'POST',
    headers: { ...assignedVolunteerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ household_id: householdIds[1], outcome: 'Contacted' })
  }, 403);
  assert(outOfScope.error.includes('outside assigned turf'));

  server.close();
  console.log('api-smoke ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
