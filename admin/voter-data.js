/**
 * Shared Voter Data Module — Arafat for Congress WA-10
 * Cross-page state management for voter contact tracking.
 * All field ops pages (dashboard, phone banking, text banking, canvassing, flyers)
 * share voter status via localStorage.
 */
(function (root) {
  'use strict';

  const LS_VOTERS    = 'arafat_voters';
  const LS_VOTER_CSV = 'arafat_voters_csv_url';
  const DEFAULT_CSV  = '/data/voters-sample.csv';
  let lastImportSummary = null;

  /* ── STATUS DEFINITIONS ─────────────────────────────────────────────── */
  const STATUSES = {
    not_contacted: { label: 'Not Contacted', color: '#6b7280', pin: '#9ca3af', priority: 1 },
    follow_up:     { label: 'Follow-Up Needed', color: '#d97706', pin: '#f59e0b', priority: 2 },
    donor_interest:{ label: 'Donor Interest', color: '#b8860d', pin: '#eab308', priority: 3 },
    contacted:     { label: 'Contacted', color: '#166534', pin: '#22c55e', priority: 4 },
    canvassed:     { label: 'Canvassed', color: '#1d4fa8', pin: '#3b82f6', priority: 5 },
    dnc:           { label: 'Do Not Contact', color: '#991b1b', pin: '#ef4444', priority: 0 }
  };

  /* ── AREA LIST ───────────────────────────────────────────────────────── */
  const AREAS = [
    'Spanaway', 'Lakewood', 'Olympia', 'Lacey / Tumwater',
    'University Place', 'JBLM Communities', 'Puyallup / South Hill'
  ];

  /* ── CSV PARSING ─────────────────────────────────────────────────────── */
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseVoterCsv(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      lastImportSummary = {
        totalRowsRead: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        reasons: {}
      };
      return [];
    }
    const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const summary = {
      totalRowsRead: lines.length - 1,
      rowsImported: 0,
      rowsSkipped: 0,
      reasons: {}
    };

    const addSkipReason = (reason) => {
      summary.rowsSkipped += 1;
      summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
    };

    const firstNonEmpty = (obj, keys) => {
      for (const key of keys) {
        const value = obj[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
      }
      return '';
    };

    const voters = lines.slice(1).map(line => {
      const vals = parseCsvLine(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });

      const firstName = firstNonEmpty(obj, ['firstname', 'first_name', 'fname']);
      const lastName = firstNonEmpty(obj, ['lastname', 'last_name', 'lname']);
      if (!Object.values(obj).some(Boolean)) {
        addSkipReason('empty row');
        return null;
      }
      if (!firstName && !lastName) {
        addSkipReason('missing first and last name');
        return null;
      }

      // Normalize
      return {
        id:            firstNonEmpty(obj, ['id', 'statevoterid']) || ('v' + Math.random().toString(36).slice(2, 8)),
        firstName,
        middleName:    firstNonEmpty(obj, ['middlename', 'middle_name', 'mname']),
        lastName,
        birthYear:     firstNonEmpty(obj, ['birthyear', 'birth_year']),
        address:       firstNonEmpty(obj, ['address']),
        city:          firstNonEmpty(obj, ['city', 'regcity']),
        state:         firstNonEmpty(obj, ['state', 'regstate']) || 'WA',
        zip:           firstNonEmpty(obj, ['zip', 'zip_code', 'regzipcode']),
        phone:         obj.phone     || '',
        email:         obj.email     || '',
        area:          obj.area      || '',
        lat:           parseFloat(obj.lat)  || null,
        lng:           parseFloat(obj.lng)  || null,
        party:         obj.party     || '',
        status:        STATUSES[obj.status] ? obj.status : 'not_contacted',
        contactMethod: obj.contactmethod || obj.contact_method || '',
        lastContact:   obj.lastcontact   || obj.last_contact   || '',
        lastContactBy: obj.lastcontactby || obj.last_contact_by || '',
        donorInterest: obj.donorinterest === 'true' || obj.donor_interest === 'true',
        followUpDate:  obj.followupdate  || obj.follow_up_date  || '',
        followUpBy:    obj.followupby    || obj.follow_up_by    || '',
        carrier:       obj.carrier       || '',
        smsOptIn:      obj.smsin !== 'false' && obj.sms_opt_in !== 'false',
        emailOptIn:    obj.emailoptin !== 'false' && obj.email_opt_in !== 'false',
        notes:         obj.notes         || '',
        dnc:           obj.dnc === 'true',
        voterStatus:   firstNonEmpty(obj, ['voterstatus', 'voter_status', 'statuscode']),
        registrationDate: firstNonEmpty(obj, ['registrationdate', 'registration_date']),
        lastVoted:     firstNonEmpty(obj, ['lastvoted', 'last_voted']),
        legislativeDistrict: firstNonEmpty(obj, ['legislativedistrict', 'legislative_district']),
        congressionalDistrict: firstNonEmpty(obj, ['congressionaldistrict', 'congressional_district']),
        precinctCode:  firstNonEmpty(obj, ['precinctcode', 'precinct_code']),
        _loaded:       true
      };
    }).filter(Boolean);

    summary.rowsImported = voters.length;
    lastImportSummary = summary;
    return voters;
  }

  function formatImportSummary(summary) {
    if (!summary) return '';
    const base = `Rows read: ${summary.totalRowsRead} · Imported: ${summary.rowsImported} · Skipped: ${summary.rowsSkipped}`;
    const reasonText = Object.entries(summary.reasons || {})
      .map(([reason, count]) => `${reason} (${count})`)
      .join(', ');
    return reasonText ? `${base} · Reason: ${reasonText}` : base;
  }

  /* ── STORAGE ─────────────────────────────────────────────────────────── */
  function loadVoters() {
    try {
      const raw = localStorage.getItem(LS_VOTERS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveVoters(voters) {
    try { localStorage.setItem(LS_VOTERS, JSON.stringify(voters)); } catch (e) {}
  }

  function updateVoterStatus(id, fields) {
    const voters = loadVoters();
    if (!voters) return false;
    const idx = voters.findIndex(v => v.id === id);
    if (idx < 0) return false;
    Object.assign(voters[idx], fields);
    saveVoters(voters);
    return voters[idx];
  }

  /* ── FETCH & INIT ────────────────────────────────────────────────────── */
  async function fetchAndLoadVoters(csvUrl) {
    const url = csvUrl || localStorage.getItem(LS_VOTER_CSV) || DEFAULT_CSV;
    try {
      const resp = await fetch(url + '?_cb=' + Date.now());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      const voters = parseVoterCsv(text);
      if (voters.length) {
        saveVoters(voters);
        return { ok: true, voters, count: voters.length, importSummary: lastImportSummary };
      }
      return { ok: false, error: 'No voter records parsed', importSummary: lastImportSummary };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function getVoters(csvUrl) {
    let voters = loadVoters();
    if (!voters || !voters.length) {
      const result = await fetchAndLoadVoters(csvUrl);
      if (result.ok) return result.voters;
      return [];
    }
    return voters;
  }

  /* ── MAP PIN HELPERS ─────────────────────────────────────────────────── */
  function pinColor(voter) {
    if (voter.dnc) return STATUSES.dnc.pin;
    return (STATUSES[voter.status] || STATUSES.not_contacted).pin;
  }

  function statusLabel(status) {
    return (STATUSES[status] || STATUSES.not_contacted).label;
  }

  /* ── FILTER HELPERS ──────────────────────────────────────────────────── */
  function filterVoters(voters, opts) {
    return voters.filter(v => {
      if (opts.area && opts.area !== 'all' && v.area !== opts.area) return false;
      if (opts.zip  && v.zip !== opts.zip) return false;
      if (opts.status && opts.status !== 'all' && v.status !== opts.status) return false;
      if (opts.smsOnly && !v.smsOptIn) return false;
      if (opts.emailOnly && !v.emailOptIn) return false;
      if (opts.excludeDnc && v.dnc) return false;
      if (opts.followUpOnly && v.status !== 'follow_up') return false;
      if (opts.donorOnly && !v.donorInterest) return false;
      if (opts.notContacted && v.status !== 'not_contacted') return false;
      return true;
    });
  }

  /* ── TODAY HELPER ────────────────────────────────────────────────────── */
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ── PUBLIC API ──────────────────────────────────────────────────────── */
  root.VoterData = {
    STATUSES,
    AREAS,
    today,
    parseVoterCsv,
    loadVoters,
    saveVoters,
    updateVoterStatus,
    fetchAndLoadVoters,
    getVoters,
    getLastImportSummary: () => lastImportSummary,
    formatImportSummary,
    pinColor,
    statusLabel,
    filterVoters,
    LS_VOTERS,
    LS_VOTER_CSV,
    DEFAULT_CSV
  };

})(window);
