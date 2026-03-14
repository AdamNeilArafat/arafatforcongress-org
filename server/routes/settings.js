import express from 'express';
import { listFailedRequests, listProviderUsage, readSettings, writeSettings } from '../services/settingsService.js';

export const settingsRouter = express.Router();

settingsRouter.get('/', (_req, res) => {
  res.json({ settings: readSettings() });
});

settingsRouter.post('/', (req, res) => {
  const actor = req.body?.actor || 'local_admin';
  const settings = writeSettings(req.body?.settings || {}, actor);
  res.json({ settings });
});

settingsRouter.get('/provider-usage', (req, res) => {
  res.json({ rows: listProviderUsage(Number(req.query.limit || 100)) });
});

settingsRouter.get('/failed-requests', (req, res) => {
  res.json({ rows: listFailedRequests(Number(req.query.limit || 100)) });
});
