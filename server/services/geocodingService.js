import { db, nowIso, randomId } from '../db/index.js';

function normalizeAddressInput(address) {
  return {
    line1: address.line1 || address.address1 || address.street || '',
    city: address.city || '',
    state: address.state || '',
    postalCode: address.postalCode || address.zip || '',
    country: address.country || 'US'
  };
}

export async function geocodeAddress(input, providers) {
  const address = normalizeAddressInput(input);
  let result = await providers.geocoderPrimary.geocode(address);
  if (result.status !== 'matched' && providers.geocoderFallback) result = await providers.geocoderFallback.geocode(address);
  return result;
}

async function enrichAddress(addr, providers) {
  const addressInput = { line1: addr.line1, city: addr.city, state: addr.state, postalCode: addr.postal_code, country: addr.country || 'US' };
  let result = await providers.geocoderPrimary.geocode(addressInput);
  if (result.status !== 'matched') result = await providers.geocoderFallback.geocode(addressInput);

  const now = nowIso();
  if (result.status === 'matched') {
    const tract = result.geographicIds?.tract || null;
    const county = result.geographicIds?.county || null;
    const state = result.geographicIds?.state || null;
    const blockGroup = result.geographicIds?.blockGroup || null;

    db.prepare(`UPDATE addresses SET geocode_status=?, geocode_provider=?, geocode_quality=?, normalized_text=?, latitude=?, longitude=?, census_tract=?, census_block_group=?, updated_at=?, verified_at=?, geocode_metadata_json=? WHERE id=?`)
      .run('matched', result.provider, result.quality || 0.7, result.normalizedAddress || null, result.latitude, result.longitude, tract, blockGroup, now, now, JSON.stringify(result.raw || {}), addr.id);

    if (tract && county && state) {
      const demographics = await providers.demographics.tractProfile({ state, county, tract }).catch(() => null);
      if (demographics) {
        db.prepare('INSERT INTO enrichment_events (id, contact_id, provider, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(randomId('enr'), null, providers.demographics.name, 'acs_overlay', JSON.stringify({ addressId: addr.id, demographics }), now);
      }
      const legislative = await providers.legislative.jurisdictions(addr.state).catch(() => []);
      if (legislative.length) {
        db.prepare('UPDATE addresses SET district_ids_json=?, updated_at=? WHERE id=?').run(JSON.stringify(legislative.slice(0, 10)), now, addr.id);
      }
    }

    const finance = await providers.finance.candidatesByState(addr.state, 2026).catch(() => []);
    if (finance.length) {
      db.prepare('INSERT INTO enrichment_events (id, contact_id, provider, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomId('enr'), null, providers.finance.name, 'finance_overlay', JSON.stringify({ addressId: addr.id, candidates: finance.slice(0, 15) }), now);
    }

    const pois = await providers.places.nearbyPois({ latitude: result.latitude, longitude: result.longitude }).catch(() => []);
    if (pois.length) {
      db.prepare('INSERT INTO enrichment_events (id, contact_id, provider, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(randomId('enr'), null, providers.places.name, 'nearby_places', JSON.stringify({ addressId: addr.id, pois: pois.slice(0, 100) }), now);
    }
  } else {
    db.prepare('UPDATE addresses SET geocode_status=?, geocode_provider=?, updated_at=? WHERE id=?').run('failed', result.provider, now, addr.id);
  }
}

export async function geocodePendingAddresses(providers, batchSize = 100) {
  const pending = db.prepare("SELECT * FROM addresses WHERE geocode_status IN ('pending','retry') ORDER BY updated_at ASC LIMIT ?").all(batchSize);
  for (const addr of pending) {
    // eslint-disable-next-line no-await-in-loop
    await enrichAddress(addr, providers);
  }
  return pending.length;
}
