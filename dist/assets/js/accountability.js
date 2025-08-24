window.Accountability = window.Accountability || {};
(function (A) {
  A._filters = { party:new Set(), chamber:new Set(), badges:new Set(), industry:new Set(), search:"" };
  const has = (set,val)=> !set || set.size===0 || set.has(val);

  function ensureStyles(){
    if(document.getElementById('acct-styles')) return;
    const css = `
      .wall-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:14px 0}
      .card-person{border:1px solid #e9eef3;background:#fff;border-radius:14px;padding:12px;box-shadow:0 6px 16px rgba(13,59,102,.06);cursor:pointer;display:flex;gap:12px;align-items:flex-start}
      .card-person:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(13,59,102,.12)}
      .avatar{width:64px;height:64px;border-radius:999px;object-fit:cover;border:1px solid #e6edf5}
      .pills{margin-top:6px}
      .pill{display:inline-block;margin:2px 4px 0 0;padding:.18rem .45rem;border-radius:999px;border:1px solid #dde6f0;font-size:.78rem}
      .pill.gold{background:#fff7cc;border-color:#ffe58f}
      .pill.red{background:#ffe8e6;border-color:#ffcdc8}
      .pill.green{background:#e8f7eb;border-color:#cdeed3}
      .pill.blue{background:#eef3ff;border-color:#d7e0ff}
      .muted{color:#5b6b7c;font-size:.86rem}
      .strong{font-weight:800}
      #modal.open{display:block}
    `;
    const style=document.createElement('style'); style.id='acct-styles'; style.textContent=css; document.head.appendChild(style);
  }

  const pct = (num,den)=> den? Math.round(100*num/den) : 0;
  const toneForBadge=(label)=>{
    const s=(label||'').toLowerCase();
    if(s.includes('oil')||s.includes('fossil')||s.includes('war')||s.includes('aipac')) return 'red';
    if(s.includes('grass')||s.includes('small')) return 'green';
    if(s.includes('pac')||s.includes('cash')||s.includes('bought')) return 'gold';
    return 'blue';
  };
  const headshotUrl = (r)=> r.headshot || `/assets/members/${r.person_id||''}.jpg`;

  function enrich(r){
    const byInd = {};
    (r.donations||[]).forEach(d=>{
      const k=d.industry||'Unknown'; byInd[k]=(byInd[k]||0)+(d.amount||0);
    });
    const total = r.receipts?.total||0, pac=r.receipts?.pac||0, small=r.receipts?.small_dollar||0;
    const shares = Object.fromEntries(Object.entries(byInd).map(([k,v])=>[k, total? Math.round(1000*v/total)/10 : 0]));
    const badges=[];
    if (total && pac/total>=0.30) badges.push('Big PAC Backed');
    if (total && ((byInd['Oil & Gas']||0)+(byInd['Utilities']||0))/total>=0.10) badges.push('Fossil-Heavy');
    if (total && small/total>=0.40) badges.push('Grassroots');
    return {...r, shares, finance_badges:badges, vote_badges:[]};
  }

  function applyOverrides(rows, overrides){
    const addBadges = overrides.badges||{}; const applied = overrides.applied||[];
    const byPersonVotes={}; for(const ap of applied){ (byPersonVotes[ap.person_id] ||= []).push(ap); }
    return rows.map(r=>{
      const extra=(addBadges[r.person_id]||[]); const votes=(byPersonVotes[r.person_id]||[]);
      const voteBadges = votes.map(v=>v.badge).filter(Boolean);
      const badges = Array.from(new Set([...(r.finance_badges||[]), ...extra, ...voteBadges]));
      return {...r, badges, vote_badges: voteBadges, adminVotes: votes};
    });
  }

  A.loadAll = async function(){
    ensureStyles();
    let core=[];
    try{
      core = await fetch('/data/financial_alignment.json',{cache:'no-store'}).then(r=>r.ok?r.json():[]);
      if(!Array.isArray(core)) core=[];
    }catch(e){ core=[]; }

    if(core.length < 20){
      try{
        const m = await fetch('/data/members.json',{cache:'no-store'}).then(r=>r.json());
        const arr = Array.isArray(m) ? m : Object.values(m||{});
        core = arr.map(m=>({
          person_id: m.bioguide||m.id,
          name: m.name, party: (m.party||'').toUpperCase(),
          chamber: (m.chamber||'house').toLowerCase()==='senate'?'Senate':'House',
          state: m.state, district: (m.seat||'').split('-')[1]||'',
          cycle: 2026, headshot: `/assets/members/${m.bioguide||m.id}.jpg`,
          receipts:{total:0,small_dollar:0,pac:0},
          donations:[], votes:[]
        }));
      }catch(e){}
    }

    const overrides = await fetch('/data/accountability_overrides.json',{cache:'no-store'})
                      .then(r=>r.ok?r.json():({applied:[],badges:{}})).catch(()=>({applied:[],badges:{}}));

    const rows = core.map(enrich);
    const merged = applyOverrides(rows, overrides);
    A._data = merged;
    A._index = Object.fromEntries(merged.map(r=>[r.person_id,r]));
    return {data:merged, overrides};
  };

  function topIndustry(rec){
    const ent = Object.entries(rec.shares||{}).sort((a,b)=>b[1]-a[1]);
    if (!ent.length) return null; const [name,pct]=ent[0]; return pct>=1 ? {name,pct} : null;
  }

  A.cardHTML = function(r){
    const total=r.receipts?.total||0, pac=r.receipts?.pac||0, small=r.receipts?.small_dollar||0;
    const pacPct  = pct(pac,total), smallPct=pct(small,total);
    const seat = r.district? `${r.state}-${r.district}` : r.state;
    const ti=topIndustry(r), tiHtml = ti? ` • Top: ${ti.name} (${ti.pct.toFixed(0)}%)` : '';

    const pills = (Array.from(new Set([...(r.finance_badges||[]), ...(r.vote_badges||[]), ...(r.badges||[])])))
      .slice(0,4).map(b=>`<span class="pill ${toneForBadge(b)}">${b}</span>`).join('');

    return `
      <div class="card-person" data-id="${r.person_id}">
        <img class="avatar" src="${headshotUrl(r)}" alt="${r.name}" onerror="this.onerror=null;this.src='/images/404-Dem.jpg';">
        <div>
          <div class="strong">${r.name}</div>
          <div class="muted">${r.party} • ${r.chamber} • ${seat}</div>
          <div class="muted">$${(total||0).toLocaleString()} total • PAC ${pacPct}% • Small ${smallPct}% ${tiHtml}</div>
          <div class="pills">${pills}</div>
        </div>
      </div>`;
  };

  A.renderWall = function(container){
    const rows = A.filteredRows();
    container.innerHTML = `<div class="wall-grid">${rows.map(A.cardHTML).join('')}</div>`;
    container.querySelectorAll('.card-person').forEach(card=>{
      card.addEventListener('click', ()=>{
        const rec = A.getById(card.getAttribute('data-id'));
        A.openModal(rec);
      });
    });
  };

  A.openModal = function(r){
    const mapYN = (p)=> p==='Yea' ? 'Yes' : p==='Nay' ? 'No' : (p||'—');
    const votes = (r.votes||[]).slice(0,12).map(v=>`<div>${v.date}: ${v.title} — ${mapYN(v.position)}</div>`).join('');
    const adminVotes = (r.adminVotes||[]).map(v=>`<div>${v.bill_id} — ${mapYN(v.vote)}</div>`).join('') || 'None';
    const donations = (r.donations||[]).slice(0,12).map(d=>`<div>$${(d.amount||0).toLocaleString()} · ${d.through||d.donor} (${d.industry||'Unknown'})</div>`).join('');

    const el = document.getElementById('modal-body') || (()=>{const d=document.createElement('div'); d.id='modal-body'; document.body.appendChild(d); return d;})();
    el.innerHTML = `
      <h3>${r.name}</h3>
      <p class="muted">Party: ${r.party} • ${r.chamber} • ${r.state}${r.district?'-'+r.district:''} • Cycle ${r.cycle||''}</p>
      <h4>Money</h4>${donations || '<div>No donations listed.</div>'}
      <h4>Vote history</h4>${votes || '<div>No votes on record.</div>'}
      <h4>Admin-applied votes</h4>${adminVotes}
    `;
    (document.getElementById('modal')||document.body).classList.add('open');
  };

  A.closeModal = ()=> (document.getElementById('modal')||document.body).classList.remove('open');
  A.toggleFilter=(k,v)=>{ const s=A._filters[k]; if(!s) return; s.has(v)?s.delete(v):s.add(v); };
  A.setSearch=q=>A._filters.search=(q||'').toLowerCase();
  A.getById = id => (A._index||{})[id];

  A.filteredRows = function(){
    const f=A._filters;
    return (A._data||[]).filter(r=>{
      if(!has(f.party,r.party)) return false;
      if(!has(f.chamber,r.chamber)) return false;
      if(f.badges && f.badges.size){
        const all = new Set([...(r.badges||[]), ...(r.finance_badges||[]), ...(r.vote_badges||[])]);
        for(const b of f.badges){ if(!all.has(b)) return false; }
      }
      if(f.industry && f.industry.size){
        let ok=false; for(const k of (r.shares?Object.keys(r.shares):[])){ if(f.industry.has(k)) { ok=true; break; } }
        if(!ok) return false;
      }
      if(f.search){ const s=(r.name+r.state+(r.district||'')+r.party+r.chamber).toLowerCase(); if(!s.includes(f.search)) return false; }
      return true;
    });
  };
})(window.Accountability || (window.Accountability={}));
