import { createGeocodingProvider, geocodeConfig } from '../lib/geocoding/provider';
import { listGeocodeJobs, updateImportGeocodeCounters, withDbWrite } from '../lib/db/store';

export async function geocodeHouseholdsBatch(limit = 50) {
  const config = geocodeConfig();
  const provider = createGeocodingProvider();
  const jobs = listGeocodeJobs()
    .filter((job) => job.status === 'queued' && new Date(job.next_run_at).getTime() <= Date.now())
    .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))
    .slice(0, limit);

  let geocoded = 0;
  let errors = 0;

  async function processJob(job: (typeof jobs)[number]) {
    withDbWrite((state) => {
      const target = state.geocode_jobs.find((j) => j.id === job.id);
      if (target) {
        target.status = 'processing';
        target.updated_at = new Date().toISOString();
      }
    });

    try {
      const result = await provider.geocode(job.full_address);
      withDbWrite((state) => {
        const targetJob = state.geocode_jobs.find((j) => j.id === job.id);
        const voter = state.voters.find((item) => item.id === job.voter_id && !item.deleted_at);
        if (!targetJob || !voter) return;
        const timestamp = new Date().toISOString();
        targetJob.status = 'success';
        targetJob.updated_at = timestamp;
        targetJob.attempts += 1;
        voter.latitude = result.lat;
        voter.longitude = result.lng;
        voter.geocode_status = 'success';
        voter.geocode_attempts += 1;
        voter.geocode_provider = config.provider;
        voter.geocode_confidence = result.confidence;
        voter.geocode_error = undefined;
        voter.updated_at = timestamp;

        const cacheIndex = state.geocode_cache.findIndex((row) => row.normalized_address_hash === job.normalized_address_hash);
        if (cacheIndex >= 0) {
          state.geocode_cache[cacheIndex] = {
            ...state.geocode_cache[cacheIndex],
            lat: result.lat,
            lng: result.lng,
            provider: config.provider,
            updated_at: timestamp
          };
        } else {
          state.geocode_cache.push({
            id: `${job.normalized_address_hash}-${Date.now()}`,
            normalized_address_hash: job.normalized_address_hash,
            normalized_address_text: job.full_address.toLowerCase(),
            provider: config.provider,
            lat: result.lat,
            lng: result.lng,
            updated_at: timestamp
          });
        }
      });
      geocoded += 1;
    } catch (error) {
      errors += 1;
      withDbWrite((state) => {
        const targetJob = state.geocode_jobs.find((j) => j.id === job.id);
        const voter = state.voters.find((item) => item.id === job.voter_id && !item.deleted_at);
        if (!targetJob || !voter) return;
        const attempts = targetJob.attempts + 1;
        const exhausted = attempts >= config.maxAttempts;
        targetJob.attempts = attempts;
        targetJob.updated_at = new Date().toISOString();
        targetJob.last_error = error instanceof Error ? error.message : 'Unknown geocode error';
        targetJob.status = exhausted ? 'failed' : 'queued';
        targetJob.next_run_at = new Date(Date.now() + config.backoffSeconds * 1000 * attempts).toISOString();
        voter.geocode_attempts = attempts;
        voter.geocode_error = targetJob.last_error;
        voter.geocode_status = exhausted ? 'failed' : 'pending';
      });
    }
  }

  const concurrency = Math.max(1, config.workerConcurrency);
  for (let i = 0; i < jobs.length; i += concurrency) {
    const slice = jobs.slice(i, i + concurrency);
    await Promise.all(slice.map((job) => processJob(job)));
  }

  const importIds = [...new Set(jobs.map((job) => job.import_id).filter(Boolean))] as string[];
  importIds.forEach((importId) => updateImportGeocodeCounters(importId));

  return {
    scanned: jobs.length,
    geocoded,
    skippedCached: 0,
    errors
  };
}
