import express from 'express';
import { geocodeAddress, geocodePendingAddresses } from '../services/geocodingService.js';

export function createGeocodeRouter(providers) {
  const router = express.Router();

  router.post('/lookup', async (req, res) => {
    const result = await geocodeAddress(req.body, providers);
    res.json(result);
  });

  router.post('/run', async (req, res) => {
    const processed = await geocodePendingAddresses(providers, Number(req.body?.batchSize || 100));
    res.json({ processed });
  });

  return router;
}
