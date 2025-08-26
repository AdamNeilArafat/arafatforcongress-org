function doGet(e) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('signature_counts');
  if (cached) {
    return ContentService.createTextOutput(cached)
      .setMimeType(ContentService.MimeType.JSON);
  }

  const ss = SpreadsheetApp.getActive().getSheetByName('signatures');
  if (!ss) {
    const empty = JSON.stringify({ candidateCount: 0, voterCount: 0 });
    return ContentService.createTextOutput(empty)
      .setMimeType(ContentService.MimeType.JSON);
  }

  const values = ss.getDataRange().getValues();
  const headers = values[0].map(String).map(h => h.toLowerCase());
  const typeIdx = headers.indexOf('type');
  let candidateCount = 0;
  let voterCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const type = String(typeIdx > -1 ? row[typeIdx] : row[0]).toLowerCase();
    if (type === 'candidate') candidateCount++;
    else if (type === 'voter') voterCount++;
  }

  const payload = JSON.stringify({ candidateCount, voterCount });
  cache.put('signature_counts', payload, 1800); // cache for 30 minutes
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
