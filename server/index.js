import express from 'express';
import { runMigrations } from './db/index.js';
import { importsRouter } from './routes/imports.js';
import { createGeocodeRouter } from './routes/geocode.js';
import { createProvidersRouter } from './routes/providers.js';
import { createRoutesRouter } from './routes/routes.js';
import { buildProviders } from './services/providerRegistry.js';

runMigrations();
const providers = buildProviders();

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/api/v3/health', (_req, res) => res.json({ ok: true, app: 'Vanguard Field Ops V3' }));
app.use('/api/v3/imports', importsRouter);
app.use('/api/v3/geocode', createGeocodeRouter(providers));
app.use('/api/v3/providers', createProvidersRouter(providers));
app.use('/api/v3/routes', createRoutesRouter(providers));

const port = Number(process.env.PORT || 4177);
app.listen(port, () => console.log(`Vanguard Field Ops V3 API listening on ${port}`));
