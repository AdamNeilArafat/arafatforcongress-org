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
    turfs: [],
    callQueue: [],
    textQueue: [],
    queueEvents: [],
    optOutLocks: [],
    users: [],
    auditEvents: [],
    settings: {}
  }, null, 2));

  const adminKey = `admin-${crypto.randomUUID()}`;
  process.env.SILO_ADMIN_SECRET = adminKey;
  process.env.SILO_ROLE_CREDENTIALS = JSON.stringify({ volunteerkey: 'volunteer' });
  process.env.SILO_GEOCODER_PROVIDER = 'deterministic';

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
  importForm.set('file', new Blob([`Voter ID,First Name,Last Name,Full Address,City,State,Zip,Party\n1,Ada,Lovelace,100 Main St,Tacoma,WA,98402,DEM\n2,Grace,Hopper,100 Main St,Tacoma,WA,98402,DEM\n3,Alan,Turing,200 Pine St,Olympia,WA,98501,IND`], { type: 'text/csv' }), 'voters.csv');
  const importRes = await req('/silo/api/imports/voters', { method: 'POST', headers: adminHeaders, body: importForm }, 202);
  assert(importRes.importId);

  let importStatus = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    importStatus = await req(`/silo/api/imports/${importRes.importId}`, { headers: adminHeaders });
    if (importStatus.status === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(importStatus.status, 'completed');
  assert.equal(importStatus.mapping_status, 'detected');
  assert.equal(importStatus.column_mapping.address, 'Full Address');
  assert.equal(importStatus.column_mapping.voter_id, 'Voter ID');
  assert(importStatus.file_sha256 && importStatus.file_sha256.length === 64);
  assert(fs.existsSync(importStatus.file_path), 'Uploaded CSV should be persisted on disk');

  const featuresAdmin = await req('/silo/api/map/features?county=all', { headers: adminHeaders });

  const flyerTargets = await req('/silo/api/flyer/targets?county=all', { headers: adminHeaders }, 200);
  assert(flyerTargets.total >= 2);
  assert(flyerTargets.targets[0].flyer_tier);
  assert(Number.isFinite(Number(flyerTargets.targets[0].flyer_score)));

  assert.equal(featuresAdmin.households.features.length, 2);
  assert(featuresAdmin.households.features.every((feature) => feature.properties.geocode_source === 'deterministic-fallback'));
  assert(featuresAdmin.households.features[0].properties.flyer_profile);
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


  await req('/silo/api/settings/actblue', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actblue_url: 'https://secure.actblue.com/donate/example' })
  }, 200);
  const donate = await req('/silo/api/donate', { headers: assignedVolunteerHeaders }, 200);
  assert(donate.actblue_url.includes('actblue.com'));

  const queueItem = await req('/silo/api/queues/enqueue', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'text', recipient: '+1 (360) 555-1111', body: 'Hello there' })
  }, 201);
  assert.equal(queueItem.channel, 'text');

  const manualSend = await req('/silo/api/text/send', {
    method: 'POST',
    headers: { ...assignedVolunteerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'manual', to: '3605551111', body: 'Can we count on your vote?' })
  }, 200);
  assert.equal(manualSend.status, 'manual_required');
  assert(manualSend.sms_deep_link.startsWith('sms:'));

  const optOut = await req('/silo/api/queues/opt-out', {
    method: 'POST',
    headers: { ...assignedVolunteerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'text', recipient: '3605551111', reason: 'STOP' })
  }, 201);
  assert.equal(optOut.channel, 'text');

  await req('/silo/api/queues/enqueue', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'text', recipient: '3605551111', body: 'blocked' })
  }, 423);

  const turf = await req('/silo/api/turfs', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Pierce A', county: 'pierce', household_ids: householdIds })
  }, 201);
  assert.equal(turf.household_ids.length, 2);

  const optimized = await req('/silo/api/routes/optimize', {
    method: 'POST',
    headers: { ...assignedVolunteerHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ household_ids: householdIds })
  }, 200);
  assert.equal(optimized.algorithm[0], 'nearest-neighbor');

  server.close();
  console.log('api-smoke ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
