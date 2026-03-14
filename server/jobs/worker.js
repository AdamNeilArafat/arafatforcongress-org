import { runMigrations } from '../db/index.js';
import { listImportJobs, processImportJob } from '../services/importService.js';
import { geocodePendingAddresses } from '../services/geocodingService.js';
import { buildProviders } from '../services/providerRegistry.js';

runMigrations();
const providers = buildProviders();

async function tick() {
  for (const job of listImportJobs()) {
    if (['ready', 'processing'].includes(job.status) && !job.paused) processImportJob(job.id, Number(process.env.IMPORT_CHUNK_SIZE || 250));
  }
  await geocodePendingAddresses(providers, Number(process.env.GEOCODE_BATCH_SIZE || 50));
}

setInterval(() => tick().catch((error) => console.error('[worker]', error)), Number(process.env.WORKER_INTERVAL_MS || 5000));
console.log('Vanguard Field Ops V3 worker started');
