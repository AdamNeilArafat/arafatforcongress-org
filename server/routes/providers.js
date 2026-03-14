import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createProvidersRouter(providers) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      geocoderPrimary: providers.geocoderPrimary.name,
      geocoderFallback: providers.geocoderFallback.name,
      demographics: providers.demographics.name,
      legislative: providers.legislative.name,
      finance: providers.finance.name,
      places: providers.places.name,
      geonames: providers.geonames.name,
      ai: providers.ai.name,
      routing: providers.routing.name
    });
  });

  router.get('/demographics/tract', asyncHandler(async (req, res) => {
    const data = await providers.demographics.tractProfile(req.query);
    res.json({ data });
  }));

  router.get('/legislative/people/search', asyncHandler(async (req, res) => {
    const data = await providers.legislative.peopleSearch({
      jurisdiction: req.query.jurisdiction,
      name: req.query.name,
      page: toNumber(req.query.page, 1)
    });
    res.json({ data });
  }));

  router.get('/legislative/:state', asyncHandler(async (req, res) => {
    const data = await providers.legislative.jurisdictions(req.params.state);
    res.json({ data });
  }));

  router.get('/finance/candidates/search', asyncHandler(async (req, res) => {
    const data = await providers.finance.candidateSearch({
      name: req.query.name,
      state: req.query.state,
      cycle: toNumber(req.query.cycle, 2026)
    });
    res.json({ data });
  }));

  router.get('/finance/:state', asyncHandler(async (req, res) => {
    const data = await providers.finance.candidatesByState(req.params.state, Number(req.query.cycle || 2026));
    res.json({ data });
  }));

  router.get('/places/nearby', asyncHandler(async (req, res) => {
    const latitude = toNumber(req.query.latitude, NaN);
    const longitude = toNumber(req.query.longitude, NaN);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: 'latitude and longitude are required numeric query params.' });
      return;
    }

    const data = await providers.places.nearbyPois({
      latitude,
      longitude,
      radiusMeters: toNumber(req.query.radiusMeters, 800),
      categories: req.query.categories
    });
    res.json({ data });
  }));

  router.get('/geonames/search', asyncHandler(async (req, res) => {
    const data = await providers.geonames.searchLocality({
      query: req.query.query,
      country: req.query.country,
      maxRows: toNumber(req.query.maxRows, 10)
    });
    res.json({ data });
  }));

  return router;
}
