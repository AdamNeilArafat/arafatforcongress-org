import { geocodeHouseholdsBatch } from './geocodeHouseholds';

async function run() {
  const result = await geocodeHouseholdsBatch(50);
  // eslint-disable-next-line no-console
  console.log(`Geocoding batch complete. scanned=${result.scanned} geocoded=${result.geocoded} errors=${result.errors}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
