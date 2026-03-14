import { KEYS, read, write, logActivity } from './field-ops-v3-modules/storage.js';
import { normalizeRecord, normalizeHeader, fromVoterData, hasImportableValues, mergeRecord } from './field-ops-v3-modules/data.js';
import { enrichWithApi, audit } from './field-ops-v3-modules/enrichment.js';
import { initMap, renderMap } from './field-ops-v3-modules/map.js';
import { renderCharts } from './field-ops-v3-modules/charts.js';
import { filterRecords, sortRecords, toCsv } from './field-ops-v3-modules/voters.js';
import { renderTemplate, dispositionToStatus } from './field-ops-v3-modules/outreach.js';
import { territoryMetrics } from './field-ops-v3-modules/territories.js';
import { volunteerLeaderboard, freshness } from './field-ops-v3-modules/volunteers.js';
import { $, $$, setTab, countdown } from './field-ops-v3-modules/ui.js';

const state={records:read(KEYS.records,[]),events:read(KEYS.events,[]),territories:read(KEYS.territories,[]),volunteers:read(KEYS.volunteers,[]),outreach:read(KEYS.outreach,[]),selected:new Set(),sort:{key:'full_name',dir:'asc'},filters:{district:'all',status:'all',priority:'all',assigned:'all'}};
const settings=Object.assign({enrichment_api_url:'',enrichment_api_key:localStorage.getItem('enrichment_api_key')||'',election_date:'2026-11-03',phase:'Primary Push',admin_pin:localStorage.getItem('admin_pin')||'1234'},read(KEYS.settings,{}));

function persist(){write(KEYS.records,state.records);write(KEYS.events,state.events);write(KEYS.territories,state.territories);write(KEYS.volunteers,state.volunteers);write(KEYS.outreach,state.outreach);}
function sourceStatus(){if(window.VoterData) return 'voter-data module'; return 'local only';}
async function ingestInitial(){
  if(state.records.length) return;
  if(window.VoterData?.getVoters){const v=await window.VoterData.getVoters();state.records=fromVoterData(v);}
  if(!state.records.length){state.records=[];}
  persist();
}
function updateMetrics(){const r=state.records;$('#totalContacts').textContent=r.length;$('#contactsMade').textContent=r.filter(x=>x.status!=='not_contacted').length;$('#donationsPledged').textContent=r.filter(x=>x.donation_pledged||x.status==='donation_pledged').length;$('#followupsNeeded').textContent=r.filter(x=>x.status==='follow_up').length;$('#countdown').textContent=`${countdown(settings.election_date)} days`;$('#phaseBadge').textContent=settings.phase;$('#sourceStatus').textContent=sourceStatus();}
function saveSettings(){write(KEYS.settings,settings);localStorage.setItem('admin_pin',settings.admin_pin||'1234');}

function renderVoters(){const q=$('#vSearch').value;state.filters={district:$('#fDistrict').value,status:$('#fStatus').value,priority:$('#fPriority').value,assigned:$('#fVolunteer').value};let rows=filterRecords(state.records,q,state.filters);rows=sortRecords(rows,state.sort.key,state.sort.dir);const tb=$('#voterRows');tb.innerHTML=rows.map(r=>`<tr><td><input type='checkbox' data-id='${r.id}' ${state.selected.has(r.id)?'checked':''}></td><td>${r.full_name}</td><td class='address-col'>${[r.address,r.city,r.state].filter(Boolean).join(', ')||''}</td><td>${r.zip||''}</td><td>${r.phone||''}</td><td>${r.email||''}</td><td>${(r.updated_at||'').slice(0,10)}</td><td><span class='status-pill status-${r.status}'>${r.status}</span></td><td><button class='btn' data-enrich='${r.id}'>Enrich</button><button class='btn' data-status='${r.id}|contacted'>Contacted</button></td></tr>`).join('');$('#filteredCount').textContent=`${rows.length} shown`;}

async function enrichOne(id){const rec=state.records.find(r=>r.id===id);if(!rec) return;try{const patch=await enrichWithApi(rec,settings);Object.assign(rec,mergeRecord(rec,patch));audit({id,ok:true});persist();renderAll();}catch(e){audit({id,ok:false,error:e.message});alert(e.message==='missing_api_key'?'Add Enrichment API key in Settings.':e.message==='missing_api_url'?'Add Enrichment API URL in Settings.':`Enrichment failed: ${e.message}`);} }
async function enrichSelected(){const ids=[...state.selected];if(!ids.length)return;let ok=0,fail=0;for(let i=0;i<ids.length;i++){ $('#enrichProg').style.width=`${Math.round(((i)/ids.length)*100)}%`; try{await enrichOne(ids[i]);ok++;}catch{fail++;} $('#enrichStats').textContent=`${ok} success / ${fail} failed`; }
$('#enrichProg').style.width='100%';}

function importCsv(file){Papa.parse(file,{header:true,skipEmptyLines:true,complete:(res)=>{const mapped=res.data.map(row=>{const n={};Object.entries(row).forEach(([k,v])=>n[normalizeHeader(k)]=v);return normalizeRecord(n);}).filter(hasImportableValues);state.records=[...state.records,...mapped];persist();renderAll();}})}
function exportCsv(selectedOnly=false){const ids=state.selected;const rows=selectedOnly?state.records.filter(r=>ids.has(r.id)):filterRecords(state.records,$('#vSearch').value,state.filters);if(!rows.length)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([toCsv(rows)],{type:'text/csv'}));a.download=`field-ops-v3-${selectedOnly?'selected':'filtered'}-${new Date().toISOString().slice(0,10)}.csv`;a.click();}

function renderOutreach(){const c=state.selected.size?state.records.find(r=>state.selected.has(r.id)):state.records[0];$('#msgPreview').textContent=c?renderTemplate($('#msgTemplate').value,c):'';$('#sentCount').textContent=state.outreach.length;$('#outreachRows').innerHTML=state.outreach.slice(0,60).map(o=>`<tr><td>${o.ts.slice(0,10)}</td><td>${o.name}</td><td>${o.channel}</td><td>${o.disposition||''}</td></tr>`).join('');}
function logOutreach(){const c=state.selected.size?state.records.find(r=>state.selected.has(r.id)):null;if(!c)return;const disposition=$('#callDisposition').value;state.outreach.unshift({ts:new Date().toISOString(),name:c.full_name,channel:$('#channel').value,message:renderTemplate($('#msgTemplate').value,c),disposition,notes:$('#callNotes').value});const newStatus=dispositionToStatus(disposition);if(newStatus){Object.assign(c,mergeRecord(c,{status:newStatus,last_contacted_at:new Date().toISOString(),contact_attempts:(c.contact_attempts||0)+1}));}persist();renderAll();}

function renderTerritories(){const m=territoryMetrics(state.territories,state.records,state.events);$('#territoryCards').innerHTML=m.map(t=>`<div class='stat'><b>${t.name}</b><div class='small'>${t.status||'none'} · lead ${t.lead||'—'}</div><div>${t.contact_count} contacts · ${t.completion}%</div></div>`).join('')||'<div class="small">No territories yet.</div>';}
function renderVolunteers(){const lb=volunteerLeaderboard(state.volunteers,state.records);$('#volRows').innerHTML=lb.map(v=>`<tr><td>${v.name}</td><td>${v.assigned_territory||''}</td><td>${v.contacts_completed}</td><td>${v.followups_created}</td><td>${freshness(v.last_event)}</td></tr>`).join('');$('#leaderboard').innerHTML=lb.slice(0,5).map(v=>`<div>${v.name}: ${v.contacts_completed}</div>`).join('')||'<div class="small">No volunteers</div>';}

function renderAll(){updateMetrics();renderVoters();renderOutreach();renderTerritories();renderVolunteers();renderCharts(state.records,state.events);renderMap(state.records,(id,status)=>{const r=state.records.find(x=>x.id===id);if(!r)return;Object.assign(r,mergeRecord(r,{status,last_contacted_at:new Date().toISOString()}));persist();renderAll();},{status:$('#mapStatus').value});$('#recentActivity').innerHTML=read(KEYS.activity,[]).slice(0,8).map(a=>`<div class='small'>${a.ts.slice(0,10)} — ${a.message}</div>`).join('');}

function authGate(){const authed=sessionStorage.getItem('field_ops_authed')==='1';if(authed){$('#pinGate').classList.add('hidden');return;}$('#pinGate').classList.remove('hidden');$('#pinSubmit').onclick=()=>{if($('#pinInput').value===(localStorage.getItem('admin_pin')||'1234')){sessionStorage.setItem('field_ops_authed','1');$('#pinGate').classList.add('hidden');}else{$('#pinErr').textContent='Incorrect PIN';}};}

function bind(){
  $$('.tab').forEach(t=>t.onclick=()=>setTab(t.dataset.tab)); setTab('map');
  $('#settingsBtn').onclick=()=>{$('#settingsModal').classList.remove('hidden');$('#apiKey').value=settings.enrichment_api_key||localStorage.getItem('enrichment_api_key')||'';$('#apiUrl').value=settings.enrichment_api_url||'';$('#campaignPhase').value=settings.phase||'';$('#adminPin').value=settings.admin_pin;};
  $('#closeSettings').onclick=()=>$('#settingsModal').classList.add('hidden');
  $('#saveSettings').onclick=()=>{settings.enrichment_api_key=$('#apiKey').value.trim();settings.enrichment_api_url=$('#apiUrl').value.trim();localStorage.setItem('enrichment_api_key',settings.enrichment_api_key);settings.admin_pin=$('#adminPin').value.trim()||settings.admin_pin;settings.phase=$('#campaignPhase').value.trim()||settings.phase;saveSettings();$('#settingsModal').classList.add('hidden');renderAll();};
  $('#csvImport').onchange=e=>importCsv(e.target.files[0]); $('#exportFiltered').onclick=()=>exportCsv(false); $('#exportSelected').onclick=()=>exportCsv(true);
  $('#vSearch').oninput=renderVoters; ['fDistrict','fStatus','fPriority','fVolunteer'].forEach(id=>$('#'+id).onchange=renderVoters);
  $('#voterRows').onclick=e=>{const enrich=e.target.dataset.enrich;const status=e.target.dataset.status;if(enrich)enrichOne(enrich);if(status){const [id,s]=status.split('|');const r=state.records.find(x=>x.id===id);Object.assign(r,mergeRecord(r,{status:s}));persist();renderAll();}}
  $('#voterRows').onchange=e=>{if(e.target.matches('input[type="checkbox"][data-id]')){e.target.checked?state.selected.add(e.target.dataset.id):state.selected.delete(e.target.dataset.id);renderOutreach();}};
  $('#selectAll').onclick=()=>{state.records.forEach(r=>state.selected.add(r.id));renderVoters();renderOutreach();};$('#clearSelection').onclick=()=>{state.selected.clear();renderVoters();renderOutreach();};
  $('#batchEnrich').onclick=enrichSelected; $('#mapStatus').onchange=renderAll;
  $('#logOutreach').onclick=()=>{logOutreach();logActivity('Outreach logged');};
  $('#addTerritory').onclick=()=>{state.territories.push({id:crypto.randomUUID(),name:$('#tName').value,district:$('#tDistrict').value,lead:$('#tLead').value,status:$('#tStatus').value});persist();renderTerritories();};
  $('#addVolunteer').onclick=()=>{state.volunteers.push({id:crypto.randomUUID(),name:$('#volName').value,assigned_territory:$('#volTerritory').value,last_event:$('#volLastEvent').value});persist();renderVolunteers();};
  $('#addEvent').onclick=()=>{state.events.push({id:crypto.randomUUID(),name:$('#eventName').value,date:$('#eventDate').value,contacts_completed:Number($('#eventContacts').value)||0,territory_id:''});persist();renderAll();};
  $('#clearAll').onclick=()=>{if(confirm('Clear all V3 data?')){Object.values(KEYS).forEach(k=>localStorage.removeItem(k));location.reload();}};
}

window.addEventListener('DOMContentLoaded',async()=>{authGate();initMap();await ingestInitial();bind();renderAll();});
