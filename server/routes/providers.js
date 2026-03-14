import express from 'express';

export function createProvidersRouter(providers) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      geocoderPrimary: providers.geocoderPrimary.name,
      geocoderFallback: providers.geocoderFallback.name,
      demographics: providers.demographics.name,
      legislative: providers.legislative.name,
      finance: providers.finance.name,
      ai: providers.ai.name,
      routing: providers.routing.name
    });
  });

  router.get('/demographics/tract', async (req, res) => {
    const data = await providers.demographics.tractProfile(req.query);
    res.json({ data });
  });

  router.get('/legislative/:state', async (req, res) => {
    const data = await providers.legislative.jurisdictions(req.params.state);
    res.json({ data });
  });

  router.get('/finance/:state', async (req, res) => {
    const data = await providers.finance.candidatesByState(req.params.state, Number(req.query.cycle || 2026));
    res.json({ data });
  });

  return router;
}
