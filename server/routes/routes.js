import express from 'express';
import { db, nowIso, randomId } from '../db/index.js';
import { nearestNeighborRoute } from '../providers/routing.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function createRoutesRouter(providers) {
  const router = express.Router();

  router.post('/plan', asyncHandler(async (req, res) => {
    const { name, mode = 'walking', stops = [] } = req.body;
    if (!Array.isArray(stops) || !stops.length) return res.status(400).json({ error: 'stops required' });
    const routed = providers.routing ? await providers.routing.buildRoute(stops, mode === 'walking' ? 'foot-walking' : 'driving-car') : nearestNeighborRoute(stops);
    const routeId = randomId('route');
    const now = nowIso();
    db.prepare('INSERT INTO routes (id, name, mode, provider, status, distance_meters, duration_seconds, geometry_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(routeId, name || 'Generated Route', mode, providers.routing?.name || 'nearest_neighbor', 'planned', routed.distanceMeters, routed.durationSeconds, JSON.stringify(routed.geometry || null), now, now);
    routed.stops.forEach((stop, i) => {
      db.prepare('INSERT INTO route_stops (id, route_id, contact_id, address_id, stop_order, latitude, longitude, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(randomId('stop'), routeId, stop.contactId || null, stop.addressId || null, i + 1, stop.latitude, stop.longitude, 'pending', now);
    });
    res.json({ routeId, summary: routed });
  }));

  return router;
}
