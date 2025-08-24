
// Evergreen Pact: non-invasive enhancements to keep the same style & format.
// Drop this file on the site and include it near </body> with:
//   <script src="evergreen-enhancements.js" defer></script>

(function(){
  // --- tiny CSS additions that match existing look & feel ---
  const style = document.createElement('style');
  style.textContent = `
    .chip-vehicle{ background:#eef6ff; color:#0d3b66; }
    .chip-thresh{ background:#ebfaef; color:#0b6e4f; }
    .chip-risk{ background:#fff2f2; color:#b42318; }
    .chip-recon{ background:#f1f5ff; color:#1f6feb; }
    .vehicle-row{ display:flex; flex-wrap:wrap; gap:.35rem; margin-top:.4rem; }
    .footnote{ font-size:.78rem; color:#64748b; margin-top:.35rem; }
    .assumptions{ background:#f8fbff; border:1px solid #dbe7f5; border-radius:12px; padding:.75rem; margin:.75rem 0 1rem 0; }
    .assumptions h3{ font-size:1rem; margin:0 0 .4rem 0; color:#0d3b66; font-weight:800; }
    .assumptions .row{ row-gap:.5rem; }
    .assumptions .form-select, .assumptions .form-control{ height:32px; padding:.25rem .5rem; font-size:.9rem; }
    .badge-helper{ font-size:.75rem; font-weight:700; color:#475569; }
  `;
  document.head.appendChild(style);

  // --- Add an "Assumptions" drawer above the toolbar (visual only; odds not recalculated) ---
  try{
    const toolsBarSection = document.querySelector('section.container.mb-3');
    if(toolsBarSection){
      const box = document.createElement('div');
      box.className = 'container';
      box.innerHTML = `
        <div class="assumptions" role="region" aria-label="Assumptions that influence odds">
          <h3>Assumptions (for transparency)</h3>
          <div class="row g-2 align-items-center">
            <div class="col-md-3">
              <label class="badge-helper">House margin</label>
              <select class="form-select" aria-label="House margin">
                <option>+5 to +9</option>
                <option selected>+10 to +19</option>
                <option>+20 or more</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="badge-helper">Senate control</label>
              <select class="form-select" aria-label="Senate control">
                <option selected>Divided (60-vote reality)</option>
                <option>Unified (recon likely)</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="badge-helper">Suspension viability</label>
              <select class="form-select" aria-label="Suspension viability">
                <option>Limited &lt; 2/3</option>
                <option selected>Some bipartisan support</option>
                <option>Broad bipartisan</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="badge-helper">Vehicle posture</label>
              <select class="form-select" aria-label="Vehicle posture">
                <option selected>Appropriations + riders</option>
                <option>Authorizing bills</option>
                <option>NDAA anchor</option>
                <option>Reconciliation eligible</option>
              </select>
            </div>
          </div>
          <div class="small mt-2">Note: Odds shown on cards are baseline; this panel exposes the underlying levers without changing numbers on this page.</div>
        </div>`;
      toolsBarSection.parentNode.insertBefore(box, toolsBarSection);
    }
  }catch(e){}

  // --- Helper to inject chips row into a given card ---
  function addChips(stepId, chips, footnote){
    const wrap = document.getElementById(stepId);
    if(!wrap) return;
    const card = wrap.querySelector('.card-step');
    if(!card) return;
    // Find a reasonable place right under the title block
    const body = card.querySelector('.card-body');
    const crumb = body.querySelector('.crumb');
    let anchor = crumb ? crumb.nextElementSibling : body.firstElementChild;
    // Ensure we add below the first metadata row
    const title = body.querySelector('h4');
    const afterTitle = title ? title.nextElementSibling : null;

    // Build chip row
    const row = document.createElement('div');
    row.className = 'vehicle-row';
    chips.forEach(c=>{
      const span = document.createElement('span');
      span.className = 'chip ' + (c.kind==='vehicle' ? 'chip-vehicle' : c.kind==='thresh' ? 'chip-thresh' : c.kind==='recon' ? 'chip-recon' : 'chip-risk');
      span.textContent = c.text;
      span.title = c.tip || '';
      row.appendChild(span);
    });

    // Insert the chip row after the title block (before the "For working people" text)
    if(title){
      title.insertAdjacentElement('afterend', row);
    }else{
      body.insertBefore(row, body.firstChild);
    }

    // Footnote if applicable
    if(footnote){
      const p = document.createElement('div');
      p.className = 'footnote';
      p.innerHTML = footnote;
      row.insertAdjacentElement('afterend', p);
    }
  }

  // --- Map step IDs to vehicles/thresholds/disclaimers ---
  const MAP = {
    // PATH A â Guardrails
    'A-G1': {chips:[
      {kind:'vehicle', text:'Appropriations (first omnibus)', tip:'Placed in initial government funding bill'},
      {kind:'thresh', text:'Simple majority (House)'},
      {kind:'chip', text:'Bicameral needed'}
    ], foot:'<em>Appropriations limitations restrict how funds are used; they do not amend permanent law unless enacted in statute.</em>'},
    'A-G1R': {chips:[
      {kind:'vehicle', text:'Riders + report directives'},
      {kind:'thresh', text:'Simple majority (House)'}
    ], foot:'<em>Committee report language is not legally binding unless incorporated; enforce via GAO follow-up and hearings.</em>'},
    'A-G2': {chips:[
      {kind:'vehicle', text:'FSGG Appropriations'},
      {kind:'thresh', text:'Simple majority (House)'},
      {kind:'chip', text:'Bicameral conference'}
    ], foot:'<em>Limitations can block publication/hosting/seals but do not change underlying law.</em>'},
    'A-G3': {chips:[
      {kind:'vehicle', text:'NDAA subtitle'},
      {kind:'chip', text:'Bicameral (House+Senate)'},
      {kind:'chip', text:'Sunset: 2 years'},
    ]},
    'A-G4': {chips:[
      {kind:'vehicle', text:'Authorizing bill or NDAA'},
      {kind:'chip', text:'Senate 60âvote reality'}
    ]},

    // PATH A â Quick wins
    'A-K1': {chips:[
      {kind:'vehicle', text:'Suspension calendar'},
      {kind:'thresh', text:'2/3 House'},
      {kind:'vehicle', text:'or Appropriations energy title'}
    ], foot:'<em>Use dashboards & fraud controls in report language if statute stalls.</em>'},
    'A-K2': {chips:[
      {kind:'vehicle', text:'Suspension calendar'},
      {kind:'thresh', text:'2/3 House'},
      {kind:'vehicle', text:'or Commerce authorizing title'}
    ]},
    'A-K3': {chips:[
      {kind:'vehicle', text:'Labor/HHS title (appropriations)'},
      {kind:'thresh', text:'Simple majority (House)'}
    ], foot:'<em>Outcome bonuses and eligibility signals should be pinned to public dashboards.</em>'},

    // PATH A â Relief & stability
    'A-R1': {chips:[
      {kind:'vehicle', text:'HHS authorizing + offsets'},
      {kind:'chip', text:'Bicameral; 60âvote Senate likely'}
    ], foot:'<em>Show 5â and 10âyear scores and named payâfors.</em>'},
    'A-R2': {chips:[
      {kind:'vehicle', text:'Transportation/Housing authorizing'},
      {kind:'chip', text:'Bicameral; 60âvote Senate likely'}
    ]},
    'A-R3': {chips:[
      {kind:'vehicle', text:'Banking/Housing authorizing'},
      {kind:'vehicle', text:'or FHFA pilot direction'}
    ], foot:'<em>Pilotâfirst via FHFA letters; guard against offâbudget workarounds.</em>'},

    // PATH A â Fairness
    'A-F1': {chips:[
      {kind:'vehicle', text:'Tax/Finance committees'},
      {kind:'recon', text:'Reconciliation? likely parts'},
      {kind:'chip', text:'Pair with CSR for leverage'}
    ], foot:'<em>Include explicit 5â & 10âyear scores; âno new taxes on working familiesâ test; enforcement dashboards.</em>'},
    'A-F2': {chips:[
      {kind:'vehicle', text:'Tax/Finance committees'},
      {kind:'recon', text:'Reconciliation? partial'},
      {kind:'chip', text:'Pair with Tax Fairness'}
    ], foot:'<em>Automate repeatâoffender penalties and public listings.</em>'},

    // PATH A â System reform
    'A-S1': {chips:[
      {kind:'vehicle', text:'FSGG Appropriations'},
      {kind:'chip', text:'Houseâonly enforcement option'},
    ], foot:'<em>Appropriations riders expire with the fiscal year; plan renewals.</em>'},
    'A-S2': {chips:[
      {kind:'vehicle', text:'House rules (simple majority)'},
      {kind:'vehicle', text:'Senate rules (harder)'},
      {kind:'vehicle', text:'Statute (60âvote Senate)'}
    ]},

    // PATH A â Longâterm
    'A-L1': {chips:[
      {kind:'vehicle', text:'Health authorizing'},
      {kind:'recon', text:'Reconciliation? some elements'}
    ]},
    'A-L2': {chips:[
      {kind:'vehicle', text:'Commission + triggers'},
      {kind:'chip', text:'Bicameral statute for full fix'}
    ]},

    // -------- PATH B mirrors (House-only path) --------
    'B-G1': {chips:[
      {kind:'vehicle', text:'House rules package'},
      {kind:'thresh', text:'Simple majority (House only)'}
    ]},
    'B-G2': {chips:[
      {kind:'vehicle', text:'FSGG riders + admin standards'},
      {kind:'thresh', text:'Simple majority (House)'}
    ], foot:'<em>Report directives arenât binding unless incorporated; enforce with GAO clocks + hearings.</em>'},
    'B-G3': {chips:[
      {kind:'vehicle', text:'Holman amendments'},
      {kind:'thresh', text:'House floor strategy'},
      {kind:'chip', text:'Conference risk'}
    ]},
    'B-G4': {chips:[
      {kind:'vehicle', text:'Committee directives + GAO requests'},
      {kind:'chip', text:'Hearings scheduled with deadlines'}
    ]},
    'B-K1': {chips:[
      {kind:'vehicle', text:'Suspension or energy title'},
      {kind:'thresh', text:'2/3 if suspension'}
    ]},
    'B-K2': {chips:[
      {kind:'vehicle', text:'Suspension or commerce title'},
      {kind:'thresh', text:'2/3 if suspension'}
    ]},
    'B-K3': {chips:[
      {kind:'vehicle', text:'Labor/HHS title (House)'},
      {kind:'thresh', text:'Simple majority'}
    ]},
    'B-R1': {chips:[
      {kind:'vehicle', text:'HHS title (House)'},
      {kind:'chip', text:'Offsets + dashboards'}
    ]},
    'B-R2': {chips:[
      {kind:'vehicle', text:'THUD title (House)'},
      {kind:'chip', text:'State/local grants backstop'}
    ]},
    'B-R3': {chips:[
      {kind:'vehicle', text:'FHFA pilot direction (House)'},
      {kind:'chip', text:'Demonstration in 5 metros'}
    ]},
    'B-F1': {chips:[
      {kind:'vehicle', text:'Tax/Finance (House)'},
      {kind:'recon', text:'Reconciliation? future pairing'},
      {kind:'chip', text:'Pair with CSR'}
    ]},
    'B-F2': {chips:[
      {kind:'vehicle', text:'Tax/Finance (House)'},
      {kind:'chip', text:'Repeatâoffender riders if needed'}
    ]},
    'B-S1': {chips:[
      {kind:'vehicle', text:'FSGG title (House)'},
      {kind:'chip', text:'Houseâonly enforcement possible'}
    ]},
    'B-S2': {chips:[
      {kind:'vehicle', text:'House rules (simple majority)'},
      {kind:'vehicle', text:'Statute later (harder)'}
    ]},
    'B-L1': {chips:[
      {kind:'vehicle', text:'Hearings + pilot direction'},
      {kind:'recon', text:'Reconciliation? some elements later'}
    ]},
    'B-L2': {chips:[
      {kind:'vehicle', text:'Commission + triggers (House start)'},
      {kind:'chip', text:'Statute for full fix later'}
    ]},
  };

  Object.entries(MAP).forEach(([id, cfg])=>{
    addChips(id, cfg.chips || [], cfg.foot || '');
  });

  // --- Add tiny âLimitations vs legislatingâ footers to ALL cards that mention Appropriations in the "How we pass it" text, if not already added.
  document.querySelectorAll('.card-step .card-body').forEach(body=>{
    const how = Array.from(body.querySelectorAll('p')).find(p=>/How we pass it:|House move:/i.test(p.innerText||''));
    if(!how) return;
    const txt = how.innerText.toLowerCase();
    if((txt.includes('appropriations') || txt.includes('fsgg')) && !body.querySelector('.footnote')){
      const p = document.createElement('div');
      p.className = 'footnote';
      p.innerHTML = '<em>Appropriations riders limit use of funds and typically expire with the fiscal year; they do not make permanent law.</em>';
      how.insertAdjacentElement('afterend', p);
    }
  });

  // --- Add subtle âReconciliation?â note to Tax/Finance cards if not present
  ['A-F1','A-F2','B-F1','B-F2','A-L1','B-L1','A-R1'].forEach(id=>{
    const wrap = document.getElementById(id);
    if(!wrap) return;
    const hasRecon = wrap.querySelector('.chip-recon');
    if(!hasRecon){
      addChips(id, [{kind:'recon', text:'Reconciliation? check Byrd rules', tip:'Primarily budgetary effects; within committee instructions; windowâcompliant'}]);
    }
  });

  // Done
})();
