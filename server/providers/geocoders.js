import { BaseProvider } from './base.js';
import { GeocoderProvider } from './interfaces.js';

function normAddress(input) {
  return [input.line1, input.city, input.state, input.postalCode, input.country || 'US'].filter(Boolean).join(', ');
}

class GeocoderBase extends GeocoderProvider {
  constructor(name, config) {
    super();
    this.base = new BaseProvider(name, config);
    this.name = name;
    this.config = config;
  }

  cacheKey(...args) { return this.base.cacheKey(...args); }
  cacheGet(...args) { return this.base.cacheGet(...args); }
  cachePut(...args) { return this.base.cachePut(...args); }
  logUsage(...args) { return this.base.logUsage(...args); }
  request(...args) { return this.base.request(...args); }
}

export class CensusGeocoderProvider extends GeocoderBase {
  constructor(config = {}) { super('census_geocoder', config); }
  async geocode(address) {
    const operation = 'geocode';
    const singleLine = encodeURIComponent(normAddress(address));
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${singleLine}&benchmark=Public_AR_Current&format=json`;
    return this.request({
      operation,
      cachePayload: address,
      url,
      ttlSeconds: 60 * 60 * 24 * 14,
      statusForValue: (normalized) => normalized.status === 'matched' ? 'ok' : 'miss',
      normalize: (data) => {
        const match = data?.result?.addressMatches?.[0];
        return match ? {
          provider: this.name,
          status: 'matched',
          latitude: match.coordinates?.y,
          longitude: match.coordinates?.x,
          normalizedAddress: match.matchedAddress,
          quality: match.tigerLine?.side ? 0.92 : 0.8,
          districtIds: {},
          geographicIds: {
            tract: match.geographies?.['Census Tracts']?.[0]?.TRACT,
            county: match.geographies?.Counties?.[0]?.COUNTY,
            state: match.geographies?.Counties?.[0]?.STATE,
            blockGroup: match.geographies?.['2020 Census Blocks']?.[0]?.BLKGRP
          },
          raw: match
        } : { provider: this.name, status: 'no_match' };
      }
    });
  }
}

export class NominatimProvider extends GeocoderBase {
  constructor(config = {}) { super('nominatim', config); }
  async geocode(address) {
    const q = encodeURIComponent(normAddress(address));
    const url = `${this.config.baseUrl || 'https://nominatim.openstreetmap.org'}/search?q=${q}&format=json&limit=1`;
    return this.request({
      operation: 'geocode',
      cachePayload: address,
      url,
      init: { headers: { 'User-Agent': this.config.userAgent || 'vanguard-field-ops-v3/1.0 (+local self-hosted)' } },
      ttlSeconds: 60 * 60 * 24 * 7,
      statusForValue: (normalized) => normalized.status === 'matched' ? 'ok' : 'miss',
      normalize: (data) => {
        const first = data?.[0];
        return first ? {
          provider: this.name,
          status: 'matched',
          latitude: Number(first.lat),
          longitude: Number(first.lon),
          normalizedAddress: first.display_name,
          quality: Number(first.importance || 0.6),
          districtIds: {},
          raw: first
        } : { provider: this.name, status: 'no_match' };
      }
    });
  }
}
