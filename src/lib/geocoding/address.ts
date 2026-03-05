export type AddressPartsInput = {
  address?: string;
  address_line1?: string;
  regstnum?: string;
  regstfrac?: string;
  regstname?: string;
  regsttype?: string;
  regunittype?: string;
  regunitnum?: string;
  city?: string;
  state?: string;
  zip?: string;
};

function clean(value?: string) {
  return value?.trim().replace(/\s+/g, ' ');
}

export function normalizeAddressText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashNormalizedAddress(normalizedAddress: string) {
  let hash = 2166136261;
  for (let i = 0; i < normalizedAddress.length; i += 1) {
    hash ^= normalizedAddress.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildNormalizedAddress(parts: AddressPartsInput) {
  const existing = clean(parts.address_line1 ?? parts.address);
  const street = [parts.regstnum, parts.regstfrac, parts.regstname, parts.regsttype].map(clean).filter(Boolean).join(' ');
  const unit = [parts.regunittype, parts.regunitnum].map(clean).filter(Boolean).join(' ');
  const addressLine1 = existing || [street, unit].filter(Boolean).join(' ').trim() || undefined;

  const city = clean(parts.city);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  const hasGeocodeFields = Boolean(addressLine1 && city && state && zip);
  const fullAddress = hasGeocodeFields ? `${addressLine1}, ${city}, ${state} ${zip}` : undefined;
  const normalized_full_address = fullAddress ? normalizeAddressText(fullAddress) : undefined;
  const normalized_address_hash = normalized_full_address ? hashNormalizedAddress(normalized_full_address) : undefined;

  return {
    address_line1: addressLine1,
    city,
    state,
    zip,
    full_address: fullAddress,
    normalized_full_address,
    normalized_address_hash,
    missingRequiredParts: !hasGeocodeFields
  };
}
