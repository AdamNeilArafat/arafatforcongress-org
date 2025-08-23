window.Accountability = window.Accountability || {};
(function (A) {
  A._filters = { party:new Set(), chamber:new Set(), badges:new Set(), industry:new Set(), search:"" };
  const has=(set,val)=>!set||set.size===0||set.has(val);

  A.loadAll = async function(){
    const core = await fetch('/data/financial_alignment.json',{cache:'no-store'}).then(r=>r.json());
    const overrides = await fetch('/data/accountability_overrides.json',{cache:'no-store'}).then(r=>r.json()).catch(()=>({applied:[],badges:{}}));
    const rows = core.map(enrich);
    const merged = applyOverrides(rows, overrides);
    A._data = merged;
    A._index = Object.fromEntries(merged.map(r=>[r.person_id,r]));
    return {data:merged, overrides};
  };

  function enrich(r){
    const byInd = {};
    (r.donations||[]).forEach(d=>{ const k=d.industry||'Unknown'; byInd[k]=(byInd[k]||0)+(d.amount||0); });
    const total = r.receipts?.total||0, pac=r.receipts?.pac||0, small=r.receipts?.small_dollar||0;
    const pct=x=> total? Math.round(1000*x/total)/10:0;
    const shares = Object.fromEntries(Object.entries(byInd).map(([k,v])=>[k,pct(v)]));
    const badges=[];
    if (total && pac/total>=0.30) badges.push('Big PAC Backed');
    if (total && ((byInd['Oil & Gas']||0)+(byInd['Utilities']||0))/total>=0.10) badges.push('Fossil-Heavy');
    if (total && small/total>=0.40) badges.push('Grassroots');
    return {...r, shares, finance_badges:badges, vote_badges:[]};
  }

  function applyOverrides(rows, overrides){
    const addBadges = overrides.badges||{};
    const applied = overrides.applied||[];
    const byPersonVotes={};
    for(const ap of applied){
      (byPersonVotes[ap.person_id] ||= []).push(ap);
    }
    return rows.map(r=>{
      const extra=(addBadges[r.person_id]||[]);
      const votes=(byPersonVotes[r.person_id]||[]);
      const voteBadges = votes.map(v=>v.badge).filter(Boolean);
      const badges = Array.from(new Set([...(r.finance_badges||[]), ...extra, ...voteBadges]));
      return {...r, badges, vote_badges: voteBadges, adminVotes: votes};
    });
  }

  function topIndustry(rec){
    const ent = Object.entries(rec.shares||{}).sort((a,b)=>b[1]-a[1]);
    if (!ent.length) return null; const [name,pct]=ent[0];
    return pct>=1 ? {name,pct} : null;
  }
  function toneForBadge(label){
    const s=(label||'').toLowerCase();
    if(s.includes('oil')||s.includes('fossil')||s.includes('war')||s.includes('aipac')) return 'red';
    if(s.includes('grass')||s.includes('small')) return 'green';
    if(s.includes('pac')||s.includes('cash')||s.includes('bought')) return 'gold';
    return 'blue';
  }

  A.cardHTML = function(r){
    const total=r.receipts?.total||0, pac=r.receipts?.pac||0, small=r.receipts?.small_dollar||0;
    const pacPct= total? Math.round(100*pac/total):0;
    const smallPct= total? Math.round(100*small/total):0;
    const ti=topIndustry(r), tiHtml = ti? ` • Top: <b>${ti.name}</b> (${ti.pct.toFixed(0)}%)` : '';
    const seat = r.district? `${r.state}-${r.district}` : r.state;
    const pills = (r.badges||[]).slice(0,4).map(b=>`<span class="pill ${toneForBadge(b)}">${b}</span>`).join('');
    return `
    <div class="card-person" data-id="${r.person_id}">
      <img class="avatar" src="${r.headshot||'/assets/members/default.jpg'}" alt="${r.name}" loading="lazy">
      <div class="body">
        <div class="name">${r.name}</div>
        <div class="meta">${r.party} • ${r.chamber} • ${seat}</div>
        <div class="statline"><b>$${total.toLocaleString()}</b> total • PAC <b>${pacPct}%</b> • Small <b>${smallPct}%</b>${tiHtml}</div>
        <div class="badge-rail">${pills}</div>
      </div>
    </div>`;
  };

  A.renderWall = function(container){
    const rows = A.filteredRows();
    container.innerHTML = rows.map(A.cardHTML).join('');
    container.querySelectorAll('.card-person').forEach(card=>{
      card.addEventListener('click', ()=>{
        const rec = A.getById(card.getAttribute('data-id'));
        A.openModal(rec);
      });
    });
  };

  A.openModal = function(r){
    const votes = (r.votes||[]).slice(0,8).map(v=>`<li><a href="${v.source_url}" target="_blank" rel="noopener">${v.date}: ${v.title} — <b>${v.position}</b></a></li>`).join('');
    const adminVotes = (r.adminVotes||[]).map(v=>`<li>${v.bill_id} — <b>${v.vote}</b></li>`).join('') || '<li>None</li>';
    const dons = (r.donations||[]).slice(0,8).map(d=>`<li>$${(d.amount||0).toLocaleString()} · ${d.through||d.donor} (${d.industry||'Unknown'})</li>`).join('');
    document.getElementById('modal-body').innerHTML = `
      <h2>${r.name}</h2>
      <h3>Overview</h3>
      <p>Party: ${r.party} • ${r.chamber} • ${r.state}${r.district?'-'+r.district:''} • Cycle ${r.cycle}</p>
      <h3>Money</h3><ul>${dons}</ul>
      <h3>Vote history</h3><ul>${votes}</ul>
      <h3>Admin-applied votes</h3><ul>${adminVotes}</ul>`;
    document.getElementById('modal').classList.add('open');
  };

  A.closeModal = ()=> document.getElementById('modal').classList.remove('open');
  A.toggleFilter=(k,v)=>{ const s=A._filters[k]; if(!s) return; s.has(v)?s.delete(v):s.add(v); };
  A.setSearch=q=>A._filters.search=(q||'').toLowerCase();
  A.getById=id=>(A._index||{})[id];

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
        let ok=false; for(const ind of f.industry){ if((r.shares?.[ind]||0)>=1){ ok=true; break; } }
        if(!ok) return false;
      }
      if(f.search){
        const blob = `${r.name} ${r.state} ${r.district||''}`.toLowerCase();
        if(!blob.includes(f.search)) return false;
      }
      return true;
    });
  };
})(window.Accountability);
