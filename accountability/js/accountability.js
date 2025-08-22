import { getData, getVisibleIdsFromTable } from "./data-loader.js";
import { headshot } from "./images.js";
import { pct, money } from "./formatters.js";
import { computeAllAggregates } from "./aggregates.js";
import { assertSchemas } from "./guards.js";
import { shareUrls, nativeShare } from "./share.js";

const $ = (s, el=document)=>el.querySelector(s);
const $$ = (s, el=document)=>Array.from(el.querySelectorAll(s));
const THRESH = { PAC_FLAG: 0.40, INDUSTRY_DOMINATE: 0.35, ALIGN_HIGH: 0.90 };

function chipHTML(chips){
  return chips.map(([cls,icon,label]) =>
    `<span class="badge-chip ${cls}" title="${label}"><i class="fa-solid ${icon}"></i>${label}</span>`
  ).join(" ");
}

function computeChips(dRec, aRec, vRec){
  const chips=[]; const pacPct = dRec?.pac_pct ?? 0;
  chips.push(pacPct >= THRESH.PAC_FLAG
    ? ["chip-danger","fa-hand-holding-dollar",`High PAC: ${pct(pacPct)}%`]
    : ["chip-ok","fa-people-group",`Small donors: ${100-pct(pacPct)}%`]);

  const in$ = dRec?.in_state_dollars || 0, out$ = dRec?.out_state_dollars || 0;
  chips.push(out$ > in$ * 1.05
    ? ["chip-warn","fa-route",`Out-of-state heavy (${money(out$)} vs ${money(in$)})`]
    : ["chip-ok","fa-house-flag",`Local support (${money(in$)})`]);

  const inds = dRec?.industries || {}; const total = Object.values(inds).reduce((s,v)=>s+(v||0),0);
  if (total) {
    const [k, v] = Object.entries(inds).sort((a,b)=>b[1]-a[1])[0];
    if ((v/total) >= THRESH.INDUSTRY_DOMINATE) chips.push(["chip-danger","fa-industry",`Dominant industry: ${k}`]);
  }

  const align = vRec?.donor_alignment_index ?? 0;
  if (align >= THRESH.ALIGN_HIGH) chips.push(["chip-danger","fa-scale-balanced",`Donor-aligned votes: ${pct(align)}%`]);

  if (aRec && Array.isArray(aRec.badges)) aRec.badges.forEach(b=> chips.push(["chip-danger","fa-award", b.label || b.key]));
  return chips;
}

function rowData(mid, members, donors, awards, votes){
  const m = members[mid] || {}, d = donors[mid] || {}, a = awards[mid] || null, v = votes[mid] || null;
  const pacP = pct(d.pac_pct||0), smlP = 100 - pacP; const in$ = d.in_state_dollars||0, out$ = d.out_state_dollars||0;
  const img = headshot(m);
  const inds = Object.entries(d.industries||{}).sort((x,y)=>y[1]-x[1]);
  const tiKey = inds[0]?.[0] || "—"; const tiShare = (inds[0]?.[1]||0) / (inds.reduce((s,[,vv])=>s+(vv||0),0) || 1);
  const chips = computeChips(d, a, v);
  return {
    mid, name: m.name || mid, seat: m.seat || (m.state || "—"), party: m.party || "", chamber: (m.chamber||"").toLowerCase(),
    state: (m.state||"").toLowerCase(), img, pacP, smlP, in$, out$, topIndustryKey: tiKey, topIndustryShare: tiShare,
    align: (typeof (v&&v.donor_alignment_index)==="number") ? pct(v.donor_alignment_index) : null,
    chips, votes: (v && v.votes) || [], receipts: (d && d.receipts) || []
  };
}

function rowHTML(d){
  return `<tr data-mid="${d.mid}" data-name="${d.name.toLowerCase()}" data-seat="${d.seat.toLowerCase()}" data-state="${d.state}" data-chamber="${d.chamber}">
    <td>
      <div class="d-flex align-items-center gap-2">
        <img class="avatar"
             src="${d.img.src}" srcset="${d.img.srcset}" sizes="${d.img.sizes}"
             alt="${d.img.alt}" loading="lazy" width="36" height="36"
             onerror="this.onerror=null; this.src='${d.img.placeholder}'; this.removeAttribute('srcset'); this.removeAttribute('sizes');">
        <div><div class="fw-bold">${d.name}</div><div class="text-muted small">${d.party}</div></div>
      </div>
    </td>
    <td>${d.seat}</td>
    <td data-val="${d.pacP}">${d.pacP}%</td>
    <td data-val="${d.smlP}">${d.smlP}%</td>
    <td data-val="${d.in$ - d.out$}">${money(d.in$)} / ${money(d.out$)}</td>
    <td data-val="${d.topIndustryShare}">${d.topIndustryKey==='—' ? '—' : `${d.topIndustryKey} (${pct(d.topIndustryShare)}%)`}</td>
    <td data-val="${d.align ?? -1}">${d.align===null ? '—' : d.align+'%'}</td>
    <td style="min-width:280px">${chipHTML(d.chips)}</td>
  </tr>`;
}

function hookupSorting(){
  let sortState = { key:null, dir:1 };
  $("#fa-table-el thead").addEventListener("click", (e)=>{
    const th = e.target.closest("th[data-sort]"); if(!th) return;
    const key = th.getAttribute("data-sort");
    const dir = (sortState.key===key) ? -sortState.dir : 1; sortState = { key, dir };
    $$("#fa-table-el thead th").forEach(h=>h.classList.remove("sorted-asc","sorted-desc"));
    th.classList.add(dir>0 ? "sorted-asc" : "sorted-desc");

    const tbody = $("#fa-table");
    const rows = $$("#fa-table tr[data-mid]");
    const visible = rows.filter(tr=>tr.style.display!=="none");
    const hidden = rows.filter(tr=>tr.style.display==="none");

    const valGetter = {
      name: tr => (tr.querySelector("td .fw-bold")?.textContent || "").toLowerCase(),
      seat: tr => (tr.children[1]?.textContent || "").toLowerCase(),
      pac: tr => Number(tr.children[2]?.getAttribute("data-val")||0),
      small: tr => Number(tr.children[3]?.getAttribute("data-val")||0),
      geo: tr => Number(tr.children[4]?.getAttribute("data-val")||0),
      industry: tr => Number(tr.children[5]?.getAttribute("data-val")||0),
      align: tr => Number(tr.children[6]?.getAttribute("data-val")||-1)
    }[key];

    visible.sort((a,b)=>{
      const va = valGetter(a), vb = valGetter(b);
      if(typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });

    const frag = document.createDocumentFragment();
    visible.forEach(r=>frag.appendChild(r));
    hidden.forEach(h=>frag.appendChild(h));
    tbody.innerHTML=""; tbody.appendChild(frag);
  });
}

function hookupFilters(donors){
  const qInput = $("#fa-member"), chamberSel = $("#fa-chamber"), industrySel = $("#fa-industry"), resetBtn = $("#fa-reset");
  function passesIndustryFilter(mid, wanted){
    if(!wanted) return true;
    const keys = Object.keys(donors[mid]?.industries || {}).map(k=>k.toLowerCase());
    return keys.includes(String(wanted).toLowerCase());
  }
  function applyFilters(pushState=true){
    const q = (qInput?.value || "").trim().toLowerCase();
    const ch = (chamberSel?.value || "").toLowerCase();
    const ind = (industrySel?.value || "").toLowerCase();
    let visible=0;
    $$("#fa-table tr[data-mid]").forEach(tr=>{
      const mid = tr.getAttribute("data-mid");
      const nm = tr.getAttribute("data-name") || "";
      const st = tr.getAttribute("data-state") || "";
      const seat = tr.getAttribute("data-seat") || "";
      const chamber = tr.getAttribute("data-chamber") || "";
      const textHit = !q || nm.includes(q) || st.includes(q) || seat.includes(q);
      const chamberHit = !ch || chamber === ch;
      const industryHit = passesIndustryFilter(mid, ind);
      const show = textHit && chamberHit && industryHit;
      tr.style.display = show ? "" : "none"; if (show) visible++;
    });
    $("#load-status")?.textContent = `Showing ${visible} row(s).`;
    if(pushState){
      const p = new URLSearchParams(); if(q) p.set("q", q); if(ch) p.set("chamber", ch); if(ind) p.set("industry", ind);
      history.replaceState({}, "", p.toString() ? `${location.pathname}?${p}` : location.pathname);
    }
    recomputeHeadlines();
  }
  (function syncFromURL(){
    const params = new URLSearchParams(location.search);
    if (qInput) qInput.value = params.get("q") || "";
    if (chamberSel) chamberSel.value = params.get("chamber") || "";
    if (industrySel) industrySel.value = params.get("industry") || "";
  })();
  qInput?.addEventListener("input", ()=>applyFilters());
  chamberSel?.addEventListener("change", ()=>applyFilters());
  industrySel?.addEventListener("change", ()=>applyFilters());
  resetBtn?.addEventListener("click", ()=>{ if(qInput) qInput.value=""; if(chamberSel) chamberSel.value=""; if(industrySel) industrySel.value=""; applyFilters(); });
  return applyFilters;
}

function recomputeHeadlines(){
  const ids = getVisibleIdsFromTable($("#fa-table"));
  const { donors, votes } = window.__DATA__;
  if (!ids.length){
    $("#m-pac-small").textContent = "—";
    $("#m-geo").textContent = "—";
    $("#m-top-industry").textContent = "—";
    $("#m-vote-align").textContent = "—";
    return;
  }
  const agg = computeAllAggregates(ids, donors, votes);
  $("#m-pac-small").textContent = `${pct(agg.pacSmall.pac_pct)}% PAC / ${100 - pct(agg.pacSmall.pac_pct)}% small`;
  $("#m-geo").textContent = agg.geo.label;
  $("#m-top-industry").textContent = agg.topIndustry.label;
  $("#m-vote-align").textContent = agg.voteAlign.label || "—";
}

function hookupCSVExport(){
  $("#btn-export")?.addEventListener("click", ()=>{
    const rows = $$("#fa-table tr[data-mid]").filter(tr=>tr.style.display!=="none");
    if(!rows.length) return;
    const esc = s => `"${String(s).replace(/"/g,'""')}"`;
    const header = ["Member","Seat","PAC %","Small %","In $","Out $","Top Industry","Vote Align","Badges"];
    const csv = [header.join(",")];
    rows.forEach(tr=>{
      const member = tr.querySelector(".fw-bold")?.textContent || "";
      const seat = tr.children[1]?.textContent || "";
      const pac = tr.children[2]?.textContent || "";
      const small = tr.children[3]?.textContent || "";
      const inout = tr.children[4]?.textContent || "";
      const [inStr="", outStr=""] = inout.split("/").map(s=>s.trim());
      const industry = tr.children[5]?.textContent || "";
      const align = tr.children[6]?.textContent || "";
      const badges = Array.from(tr.children[7]?.querySelectorAll(".badge-chip")||[]).map(b=>b.textContent.trim()).join(" | ");
      csv.push([member,seat,pac,small,inStr,outStr,industry,align,badges].map(esc).join(","));
    });
    const blob = new Blob([csv.join("\n")], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "financial-alignments.csv";
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
}

function hookupModal(members, donors, awards, votes){
  window.openModal = function(mid){
    const m = members[mid] || {}, d = donors[mid] || {}, v = votes[mid] || {}, a = awards[mid] || {};
    const img = headshot(m, "225x275");
    const name = m.name || mid, seat = m.seat || (m.state || ""), party = m.party || "";
    const inds = Object.entries(d.industries||{}).sort((a,b)=>b[1]-a[1]);
    const totalInd = inds.reduce((s,[,v])=>s+(v||0),0);
    const tiKey = inds[0]?.[0] || "—"; const tiShare = totalInd ? Math.round((inds[0]?.[1]||0)/totalInd*100) : 0;
    const chips = computeChips(d, a, v);

    $("#memberTitle").textContent = `${name} — ${seat}${party ? " ("+party+")" : ""}`;
    $("#memberMeta").textContent = `Top industry: ${tiKey==='—' ? '—' : `${tiKey} (${tiShare}%)`} • PAC: ${pct(d.pac_pct||0)}% • Vote align: ${typeof v.donor_alignment_index==='number'?pct(v.donor_alignment_index)+'%':'—'}`;

    $("#overview-body").innerHTML = `
      <div class="row g-3">
        <div class="col-md-4">
          <img src="${img.src}" srcset="${img.srcset}" sizes="(max-width: 768px) 50vw, 225px"
               class="w-100 rounded" alt="${img.alt}" loading="lazy"
               onerror="this.onerror=null; this.src='${img.placeholder}'; this.removeAttribute('srcset'); this.removeAttribute('sizes');">
        </div>
        <div class="col-md-8">
          <p class="mb-2"><strong>Badges:</strong> ${chips.length ? chipHTML(chips) : "None yet"}</p>
          <p class="mini mb-2">Hover a badge for its trigger. Every claim should link to receipts.</p>
          <ul class="mb-0">
            <li>PAC share: <strong>${pct(d.pac_pct||0)}%</strong> (small donors: <strong>${100-pct(d.pac_pct||0)}%</strong>)</li>
            <li>In vs Out: <strong>${money(d.in_state_dollars||0)}</strong> in / <strong>${money(d.out_state_dollars||0)}</strong> out</li>
            <li>Top industry: <strong>${tiKey==='—' ? '—' : `${tiKey} (${tiShare}%)`}</strong></li>
            <li>Vote alignment with donors: <strong>${typeof v.donor_alignment_index==='number'?pct(v.donor_alignment_index)+'%':'—'}</strong></li>
          </ul>
        </div>
      </div>`;

    $("#money-body").innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Sector</th><th class="text-end">Amount</th></tr></thead>
          <tbody>${inds.length ? inds.map(([k,val])=>`<tr><td>${k}</td><td class="text-end">${money(val)}</td></tr>`).join("") : `<tr><td colspan="2" class="text-muted">No sector detail available.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="small text-muted">Source: FEC filings; cycle-to-date where available.</div>`;

    const votesArr = (v && v.votes) || [];
    $("#votes-body").innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm align-middle">
          <thead><tr><th>Bill</th><th>Date</th><th>Vote</th><th>Link</th></tr></thead>
          <tbody>${votesArr.length ? votesArr.map(x=>`<tr><td>${x.bill||""}</td><td>${x.date||""}</td><td>${x.position||""}</td><td>${x.url?`<a href="${x.url}" target="_blank" rel="noopener">Open</a>`:'—'}</td></tr>`).join("") : `<tr><td colspan="4" class="text-muted">No tracked votes yet.</td></tr>`}</tbody>
        </table>
      </div>`;

    const receipts = (d && d.receipts) || [];
    $("#receipts-body").innerHTML = receipts.length
      ? `<ul class="list-unstyled mb-0">${receipts.map(r=>`<li class="mb-1"><a href="${r.url}" target="_blank" rel="noopener">${r.title||r.url}</a></li>`).join("")}</ul>`
      : `<p class="text-muted mb-0">No receipts linked yet.</p>`;

    const urls = shareUrls({
      url: location.href,
      title: `${name} — ${seat}`,
      text: `${name} • PAC ${pct(d.pac_pct||0)}% • Top: ${tiKey==='—'?'—':tiKey}`
    });
    $("#shareX")?.setAttribute("href", urls.x);
    $("#shareFacebook")?.setAttribute("href", urls.facebook);
    $("#shareReddit")?.setAttribute("href", urls.reddit);
    $("#shareNative")?.addEventListener("click", (e)=>{ e.preventDefault(); nativeShare({ url: location.href, title: `${name} — ${seat}` }); });

    const el = document.getElementById("memberModal");
    if (window.bootstrap?.Modal && el) new bootstrap.Modal(el).show();
  };
}

async function boot(){
  $("#load-status")?.textContent = "Loading data…";
  const { members, donors, awards, votes, meta } = await getData();
  $("#load-status")?.textContent = "Data loaded.";
  window.__DATA__ = { members, donors, awards, votes, meta };

  try { assertSchemas({ members, donors, votes, awards }); } catch (e) { console.warn(e); }

  const mids = Object.keys(donors || {});
  const tbody = $("#fa-table");
  if (!mids.length) tbody.innerHTML = `<tr><td colspan="8" class="text-muted">No finance data found.</td></tr>`;
  else {
    const rows = mids.map(id => rowData(id, members, donors, awards, votes));
    tbody.innerHTML = rows.map(rowHTML).join("");
    $$("#fa-table tr[data-mid]").forEach(tr => tr.addEventListener("click", ()=> window.openModal(tr.getAttribute("data-mid"))));
  }

  hookupSorting();
  const applyFilters = hookupFilters(donors);
  hookupCSVExport();
  hookupModal(members, donors, awards, votes);
  applyFilters(false); // initial aggregates
}
document.addEventListener("DOMContentLoaded", boot);
