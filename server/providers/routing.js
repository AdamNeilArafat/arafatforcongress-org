import { BaseProvider } from './base.js';
import { RoutingProvider } from './interfaces.js';

function haversine(a, b) {
  const R = 6371000;
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const c = 2 * Math.atan2(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2), Math.sqrt(1 - Math.sin(dLat / 2) ** 2 - Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2));
  return R * c;
}

export function nearestNeighborRoute(stops) {
  if (stops.length < 2) return { stops, distanceMeters: 0, durationSeconds: 0 };
  const remaining = stops.slice(1);
  const ordered = [stops[0]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const dist = haversine({ lat: current.latitude, lng: current.longitude }, { lat: remaining[i].latitude, lng: remaining[i].longitude });
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  const distanceMeters = ordered.slice(1).reduce((sum, stop, i) => sum + haversine({ lat: ordered[i].latitude, lng: ordered[i].longitude }, { lat: stop.latitude, lng: stop.longitude }), 0);
  return { stops: ordered, distanceMeters, durationSeconds: distanceMeters / 1.3 };
}

export class OpenRouteServiceProvider extends RoutingProvider {
  constructor(config = {}) {
    super();
    this.base = new BaseProvider('openrouteservice_optional', config);
    this.name = 'openrouteservice_optional';
    this.config = config;
  }
  request(...args) { return this.base.request(...args); }

  async buildRoute(stops, mode = 'driving-car') {
    if (!this.config.apiKey) return nearestNeighborRoute(stops);
    const coordinates = stops.map((s) => [s.longitude, s.latitude]);
    return this.request({
      operation: 'buildRoute',
      cachePayload: { mode, coordinates },
      url: `https://api.openrouteservice.org/v2/directions/${mode}`,
      init: {
        method: 'POST',
        headers: { Authorization: this.config.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates })
      },
      ttlSeconds: 7200,
      normalize: (data) => {
        const feature = data?.features?.[0];
        const summary = feature?.properties?.summary || {};
        return { stops, distanceMeters: summary.distance ?? 0, durationSeconds: summary.duration ?? 0, geometry: feature?.geometry };
      }
    });
  }
}

export { OpenRouteServiceProvider as OptionalOpenRouteServiceProvider };
