/*
 * Shared client-side logic for the accountability section.
 *
 * This module loads candidate/financial data, vote override data and bill definitions
 * from JSON files under `/data/`. It then enriches each member record with computed
 * financial badges (e.g. PAC heavy, Fossil-Heavy) and vote badges (derived from
 * admin‑applied overrides). Consumers can filter and render the data into
 * responsive card grids and tables. The admin page re-uses this module to
 * populate multi-select lists and persist override edits back to GitHub using
 * the REST API (requires a personal access token entered by the user).
 */

const Accountability = (() => {
  // Internal state for filters; categories combine with AND across sets, OR within sets.
  const state = {
    party: new Set(), // e.g. {"D","R"}
    chamber: new Set(), // {"House","Senate"}
    badges: new Set(), // set of badge labels (financial or vote)
    industry: new Set(), // industry names
    cycle: new Set(), // election cycle (year)
    search: ""
  };

  let rawData = [];
  let overrides = {};
  let bills = [];
  let enriched = [];

  /**
   * Fetch JSON from a relative path, returning an empty object on failure.
   */
  async function fetchJSON(path) {
    try {
      const resp = await fetch(path, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.error(`Failed to load ${path}:`, err);
      return Array.isArray(rawData) ? [] : {};
    }
  }

  /**
   * Load all required data in parallel. This must be called before any render.
   */
  async function loadAll() {
    const [data, ov, bl] = await Promise.all([
      fetchJSON('/data/financial_alignment.json'),
      fetchJSON('/data/accountability_overrides.json'),
      fetchJSON('/data/bills.json')
    ]);
    rawData = Array.isArray(data) ? data : [];
    overrides = ov || {};
    bills = Array.isArray(bl) ? bl : [];
    enriched = rawData.map(enrichRecord).map(applyVoteOverrides);
    return { data: enriched, overrides, bills };
  }

  /**
   * Compute industry aggregation and assign financial badges for a single member.
   */
  function enrichRecord(rec) {
    const byIndustry = {};
    (rec.donations || []).forEach(d => {
      const key = d.industry || 'Unknown';
      byIndustry[key] = (byIndustry[key] || 0) + (d.amount || 0);
    });
    const total = rec.receipts?.total || 0;
    const pct = (x) => total ? Math.round(1000 * x / total) / 10 : 0;
    // Determine badges based on receipt composition
    const badges = [];
    const pac = rec.receipts?.pac || 0;
    const small = rec.receipts?.small_dollar || 0;
    if (total && pac / total >= 0.30) badges.push('Big PAC Backed');
    const fos = (byIndustry['Oil & Gas'] || 0) + (byIndustry['Utilities'] || 0);
    if (total && fos / total >= 0.10) badges.push('Fossil-Heavy');
    if (total && small / total >= 0.40) badges.push('Grassroots');
    if (total && (byIndustry['Defense'] || 0) / total >= 0.08) badges.push('Defense-Linked');
    if (total && (byIndustry['Technology'] || 0) / total >= 0.08) badges.push('Tech-Linked');
    return {
      ...rec,
      byIndustry,
      shares: Object.fromEntries(Object.entries(byIndustry).map(([k, v]) => [k, pct(v)])),
      finance_badges: badges,
      vote_badges: [],
      voteDetails: []
    };
  }

  /**
   * Merge vote overrides into the record, producing vote badges and details.
   */
  function applyVoteOverrides(rec) {
    const personOverrides = overrides[rec.person_id] || {};
    const vBadges = [];
    const details = [];
    for (const billId of Object.keys(personOverrides)) {
      const vote = personOverrides[billId];
      const bill = bills.find(b => b.id === billId);
      if (!bill) continue;
      vBadges.push(bill.badge);
      details.push({ id: billId, title: bill.title, vote, badge: bill.badge });
    }
    return { ...rec, vote_badges: vBadges, voteDetails: details };
  }

  /**
   * Determine whether a record passes the current filter state.
   */
  function applyFilters(rec) {
    const has = (set, val) => set.size === 0 || set.has(val);
    if (!has(state.party, rec.party)) return false;
    if (!has(state.chamber, rec.chamber)) return false;
    if (!has(state.cycle, rec.cycle)) return false;
    // Badge filter: record must contain all selected badges across finance and vote
    for (const b of state.badges) {
      if (!rec.finance_badges.includes(b) && !rec.vote_badges.includes(b)) return false;
    }
    // Industry filter: record must have at least one selected industry ≥1%
    if (state.industry.size) {
      let ok = false;
      for (const ind of state.industry) {
        if ((rec.shares?.[ind] || 0) >= 1) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    // Search filter (name, state, district)
    if (state.search) {
      const s = state.search.toLowerCase();
      const hay = `${rec.name} ${rec.state} ${rec.district || ''}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }

  /**
   * Toggle a value within a given filter category.
   */
  function toggleFilter(category, value) {
    const set = state[category];
    if (!set) return;
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  /**
   * Set the search string.
   */
  function setSearch(text) {
    state.search = text || '';
  }

  /**
   * Return a fresh filtered list based on current state.
   */
  function getFiltered() {
    return enriched.filter(applyFilters);
  }

  /**
   * Render a card grid for the wall of shame.
   * @param {HTMLElement} container
   */
  function renderWall(container) {
    const rows = getFiltered();
    container.innerHTML = rows.map(cardHTML).join('');
  }

  /**
   * Render cards for the financial alignment page. This can be similar to renderWall
   * but may include extra stats; consumers can override if necessary.
   */
  function renderFinancial(container) {
    const rows = getFiltered();
    container.innerHTML = rows.map(cardFinancialHTML).join('');
  }

  /**
   * Generate HTML for a single card in the wall. Includes both finance and vote badges.
   */
  function cardHTML(rec) {
    const money = rec.receipts?.total ? `$${rec.receipts.total.toLocaleString()}` : '$0';
    const badgeHtml = [...rec.finance_badges, ...rec.vote_badges]
      .map(b => `<span class="pill">${escapeHtml(b)}</span>`)
      .join('');
    const dist = rec.district ? `–${rec.district}` : '';
    return `
      <div class="card-person" onclick="Accountability.openModal('${rec.person_id}')">
        <img class="avatar" src="${rec.headshot || '/images/default-headshot.jpg'}" alt="${escapeHtml(rec.name)}" />
        <div class="body">
          <div class="name">${escapeHtml(rec.name)}</div>
          <div class="meta">${rec.party} • ${rec.chamber} • ${rec.state}${dist}</div>
          <div class="harm">${money}</div>
          <div class="badge-rail">${badgeHtml}</div>
        </div>
      </div>`;
  }

  /**
   * Generate HTML for a card on the financial page. Shows more metrics than the wall.
   */
  function cardFinancialHTML(rec) {
    const money = rec.receipts?.total ? `$${rec.receipts.total.toLocaleString()}` : '$0';
    const pacPct = rec.receipts?.pac && rec.receipts?.total ? Math.round(1000 * rec.receipts.pac / rec.receipts.total) / 10 : 0;
    const smallPct = rec.receipts?.small_dollar && rec.receipts?.total ? Math.round(1000 * rec.receipts.small_dollar / rec.receipts.total) / 10 : 0;
    const badgeHtml = [...rec.finance_badges, ...rec.vote_badges]
      .map(b => `<span class="pill">${escapeHtml(b)}</span>`)
      .join('');
    const dist = rec.district ? `–${rec.district}` : '';
    return `
      <div class="card-person" onclick="Accountability.openModal('${rec.person_id}')">
        <img class="avatar" src="${rec.headshot || '/images/default-headshot.jpg'}" alt="${escapeHtml(rec.name)}" />
        <div class="body">
          <div class="name">${escapeHtml(rec.name)}</div>
          <div class="meta">${rec.party} • ${rec.chamber} • ${rec.state}${dist}</div>
          <div class="harm">${money}</div>
          <div class="meta">PAC: ${pacPct}% | Small: ${smallPct}%</div>
          <div class="badge-rail">${badgeHtml}</div>
        </div>
      </div>`;
  }

  /**
   * Open a modal showing detailed info for a specific member.
   */
  function openModal(id) {
    const rec = enriched.find(x => x.person_id === id);
    if (!rec) return;
    const modal = document.getElementById('modal');
    const bodyEl = document.getElementById('modal-body');
    const voteLines = rec.voteDetails.map(v => `<li><span class="badge">${escapeHtml(v.badge)}</span> <b>${escapeHtml(v.vote)}</b> &ndash; ${escapeHtml(v.title)}</li>`).join('');
    const receiptLines = (rec.donations || []).slice(0, 10).map(d => `<li>$${d.amount.toLocaleString()} · ${escapeHtml(d.through)} (${escapeHtml(d.industry || 'Unknown')})</li>`).join('');
    bodyEl.innerHTML = `
      <h2>${escapeHtml(rec.name)}</h2>
      <p><strong>${rec.party} • ${rec.chamber} • ${rec.state}${rec.district ? '–' + rec.district : ''} • Cycle ${rec.cycle}</strong></p>
      <h3>Vote Badges</h3>
      <ul>${voteLines || '<li>No overrides applied.</li>'}</ul>
      <h3>Top Donations</h3>
      <ul>${receiptLines || '<li>No donations listed.</li>'}</ul>
    `;
    modal.classList.add('open');
  }

  /**
   * Close the modal. Attach to overlay click or button as needed.
   */
  function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('open');
  }

  /**
   * Escape HTML special characters to avoid injection issues.
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Persist override edits to GitHub. Requires a personal access token with
   * repo contents write access. This function will fetch the current file
   * metadata to obtain the blob SHA, then PUT the updated file.
   *
   * NOTE: This will only work when called from a browser loaded from the
   * deployed GitHub Pages domain because fetch requests to api.github.com
   * require CORS. Do not run from localhost without configuring CORS.
   * @param {string} token GitHub personal access token
   * @param {Object} newOverrides Updated overrides object
   */
  async function saveOverridesToGitHub(token, newOverrides) {
    if (!token) throw new Error('GitHub token is required');
    const repo = 'AdamNeilArafat/arafatforcongress-org';
    const path = 'data/accountability_overrides.json';
    const apiBase = `https://api.github.com/repos/${repo}/contents/${path}`;
    // Fetch current file metadata to get the sha
    const metadataResp = await fetch(apiBase, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json'
      }
    });
    if (!metadataResp.ok) {
      throw new Error(`Failed to fetch file metadata: ${metadataResp.status}`);
    }
    const metadata = await metadataResp.json();
    const sha = metadata.sha;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(newOverrides, null, 2))));
    const body = {
      message: 'Update accountability overrides',
      content,
      sha
    };
    const putResp = await fetch(apiBase, {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json'
      },
      body: JSON.stringify(body)
    });
    if (!putResp.ok) {
      throw new Error(`Failed to update file: ${putResp.status}`);
    }
    return await putResp.json();
  }

  return {
    state,
    loadAll,
    toggleFilter,
    setSearch,
    getFiltered,
    renderWall,
    renderFinancial,
    openModal,
    closeModal,
    saveOverridesToGitHub
  };
})();