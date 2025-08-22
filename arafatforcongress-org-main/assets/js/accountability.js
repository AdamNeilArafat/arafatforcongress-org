<script>
(() => {
  const $grid = document.getElementById('member-grid');
  const tpl = document.getElementById('member-card-tpl').innerHTML;

  // TODO: Replace with your build output.
  // At build time, emit members as JSON with their computed badges/bills.
  const members = window.MEMBERS || [];

  // Populate state dropdown from data
  const states = [...new Set(members.map(m => m.state))].sort();
  const stateSel = document.getElementById('filter-state');
  states.forEach(s => stateSel.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));

  // Render grid
  const render = (list) => {
    $grid.innerHTML = list.map(m => {
      // Basic micro-template replace
      let html = tpl.replaceAll('{{bioguide_id}}', m.bioguide_id)
                    .replaceAll('{{name}}', m.name)
                    .replaceAll('{{state}}', m.state)
                    .replaceAll('{{district}}', m.district ?? '')
                    .replaceAll('{{party}}', m.party)
                    .replaceAll('{{badges}}', (m.badges || []).join(','))
                    .replaceAll('{{bills}}', (m.bills || []).join(','));
      // badges_icons (simple)
      const icons = (m.badges || []).map(b => ({ title: b.title || b, short: (b.short || b.slice(0,3)).toUpperCase() }));
      html = html.replace('{{#badges_icons}}', '').replace('{{/badges_icons}}', '');
      html = html.replaceAll('{{title}}', '').replaceAll('{{short}}', '');
      // quick hack: inject icons by placeholder id after insert
      return html;
    }).join('');
    // After cards mount, wire buttons
    $grid.querySelectorAll('.view-details').forEach(btn => btn.addEventListener('click', openModal));
  };

  // Filters
  const controls = {
    state: document.getElementById('filter-state'),
    party: document.getElementById('filter-party'),
    badge: document.getElementById('filter-badge'),
    bill:  document.getElementById('filter-bill'),
    text:  document.getElementById('filter-text'),
    clear: document.getElementById('clear-filters'),
  };

  const apply = () => {
    const q = (controls.text.value || '').toLowerCase().trim();
    const st = controls.state.value;
    const pa = controls.party.value;
    const ba = controls.badge.value;
    const bi = controls.bill.value;

    const filtered = members.filter(m => {
      if (st && m.state !== st) return false;
      if (pa && m.party !== pa) return false;
      if (ba && !(m.badges || []).map(x => (x.id || x)).includes(ba)) return false;
      if (bi && !(m.bills  || []).includes(bi)) return false;
      if (q) {
        const hay = `${m.name} ${m.state}${m.district} ${(m.badges||[]).join(' ')} ${(m.bills||[]).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    render(filtered);
    history.replaceState({}, '', buildQueryString());
  };

  const buildQueryString = () => {
    const p = new URLSearchParams();
    if (controls.state.value) p.set('state', controls.state.value);
    if (controls.party.value) p.set('party', controls.party.value);
    if (controls.badge.value) p.set('badge', controls.badge.value);
    if (controls.bill.value)  p.set('bill',  controls.bill.value);
    if (controls.text.value)  p.set('q',     controls.text.value);
    const qs = p.toString();
    return qs ? `?${qs}` : location.pathname;
  };

  // Read URL params on load (deep-linkable filters)
  const params = new URLSearchParams(location.search);
  if (params.get('state')) controls.state.value = params.get('state');
  if (params.get('party')) controls.party.value = params.get('party');
  if (params.get('badge')) controls.badge.value = params.get('badge');
  if (params.get('bill'))  controls.bill.value  = params.get('bill');
  if (params.get('q'))     controls.text.value  = params.get('q');

  ['change','keyup'].forEach(ev => {
    controls.state.addEventListener('change', apply);
    controls.party.addEventListener('change', apply);
    controls.badge.addEventListener('change', apply);
    controls.bill.addEventListener('change', apply);
    controls.text.addEventListener('keyup',  apply);
  });
  controls.clear.addEventListener('click', () => {
    controls.state.value = controls.party.value = controls.badge.value = controls.bill.value = '';
    controls.text.value = '';
    apply();
  });

  // Modal loader
  const openModal = (e) => {
    const id = e.currentTarget.dataset.id;
    const m = members.find(x => x.bioguide_id === id);
    if (!m) return;
    document.getElementById('memberTitle').textContent = `${m.name} — ${m.state}-${m.district} (${m.party})`;
    document.getElementById('overview-body').innerHTML = renderOverview(m);
    document.getElementById('money-body').innerHTML = renderMoney(m);
    document.getElementById('votes-body').innerHTML = renderVotes(m);
    document.getElementById('receipts-body').innerHTML = renderReceipts(m);
    const modal = new bootstrap.Modal(document.getElementById('memberModal'));
    modal.show();
  };

  const renderOverview = (m) => `
    <div class="row g-3">
      <div class="col-md-4">
        <img src="assets/members/${m.bioguide_id}.jpg" class="w-100 rounded" onerror="this.src='assets/members/placeholder.jpg'"/>
      </div>
      <div class="col-md-8">
        <p class="mb-2"><strong>Badges:</strong> ${(m.badges||[]).length ? (m.badges||[]).map(b=>`<span class="badge text-bg-dark me-1">${b.title||b}</span>`).join('') : 'None yet'}</p>
        <p class="text-muted small mb-2">Hover a badge for its trigger. Click receipts for proof.</p>
        <p class="mb-0"><strong>Summary:</strong> ${m.summary||'No summary available.'}</p>
      </div>
    </div>`;

  const renderMoney = (m) => `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Sector</th><th>Top Donors/PACs</th><th>Total</th></tr></thead>
        <tbody>
        ${(m.money||[]).map(r=>`<tr><td>${r.sector}</td><td>${(r.sources||[]).join(', ')}</td><td>${r.total}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="small text-muted">Source: FEC filings; amounts are cycle-to-date where available.</div>
    </div>`;

  const renderVotes = (m) => `
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Bill</th><th>Date</th><th>Vote</th><th>Link</th></tr></thead>
        <tbody>
        ${(m.votes||[]).map(v=>`<tr><td>${v.bill}</td><td>${v.date||''}</td><td>${v.position||''}</td><td><a href="${v.url}" target="_blank" rel="noopener">Open</a></td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const renderReceipts = (m) => `
    <ul class="list-unstyled">
      ${(m.receipts||[]).map(r=>`<li class="mb-1"><a href="${r.url}" target="_blank" rel="noopener">${r.title||r.url}</a></li>`).join('')}
    </ul>`;

  // initial paint
  render(members);
  apply();
})();
</script>
