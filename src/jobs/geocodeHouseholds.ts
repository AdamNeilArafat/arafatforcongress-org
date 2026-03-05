export async function geocodeHouseholdsBatch(limit = 100) {
  return {
    scanned: limit,
    geocoded: 0,
    skippedCached: 0,
    errors: 0
  };
}
