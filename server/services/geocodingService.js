import { db, nowIso } from '../db/index.js';

function normalizeAddressParts(input) {
  return {
    line1: (input.line1 || '').trim(),
    city: (input.city || '').trim(),
    state: (input.state || '').trim().toUpperCase(),
    postalCode: (input.postalCode || '').trim(),
    country: (input.country || 'US').trim().toUpperCase()
  };
}

export async function geocodeAddress(address, providers) {
  const normalized = normalizeAddressParts(address);
  if (!normalized.line1 || !normalized.city || !normalized.state || !normalized.postalCode) {
    return { status: 'blocked_missing_fields', normalized };
  }
  const isUs = normalized.country === 'US';
  let result = isUs ? await providers.geocoderPrimary.geocode(normalized) : { status: 'no_match' };
  if (result.status !== 'matched' && providers.geocoderFallback) {
    result = await providers.geocoderFallback.geocode(normalized);
  }
  return { ...result, normalized };
}

export async function geocodePendingAddresses(providers, batchSize = 100) {
  const pending = db.prepare("SELECT * FROM addresses WHERE geocode_status IN ('pending','failed') LIMIT ?").all(batchSize);
  for (const addr of pending) {
    const result = await geocodeAddress({ line1: addr.line1, city: addr.city, state: addr.state, postalCode: addr.postal_code, country: addr.country }, providers);
    const status = result.status === 'matched' ? 'success' : result.status;
    db.prepare(`UPDATE addresses SET geocode_status=?, geocode_provider=?, geocode_quality=?, latitude=?, longitude=?, normalized_text=?, geocode_metadata_json=?, updated_at=? WHERE id=?`)
      .run(status, result.provider || null, result.quality || null, result.latitude || null, result.longitude || null, result.normalizedAddress || addr.normalized_text, JSON.stringify(result.raw || {}), nowIso(), addr.id);
  }
  return pending.length;
}
