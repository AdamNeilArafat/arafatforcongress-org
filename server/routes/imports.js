import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createImportJob, getImportJob, listImportJobs, previewCsvFile, processImportJob, setImportJobState, stageCsvFile } from '../services/importService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const importsRouter = express.Router();

importsRouter.get('/jobs', (_req, res) => {
  res.json({ jobs: listImportJobs() });
});

importsRouter.get('/jobs/:jobId', (req, res) => {
  const job = getImportJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  return res.json({ job });
});

importsRouter.post('/preview', (req, res) => {
  const { filePath, sampleSize } = req.body;
  if (!filePath || !fs.existsSync(filePath)) return res.status(400).json({ error: 'filePath missing or not found' });
  return res.json(previewCsvFile(filePath, Number(sampleSize || 50)));
});

importsRouter.post('/jobs/stage', asyncHandler(async (req, res) => {
  const { filePath, fileName, mapping, dedupeRules, dryRun } = req.body;
  if (!filePath || !fs.existsSync(filePath)) return res.status(400).json({ error: 'filePath missing or not found' });
  const jobId = createImportJob({ fileName: fileName || path.basename(filePath), mapping, dedupeRules, dryRun: Boolean(dryRun) });
  const rows = await stageCsvFile(jobId, filePath);
  res.json({ jobId, rows });
}));

importsRouter.post('/jobs/:jobId/process', (req, res) => {
  const result = processImportJob(req.params.jobId, Number(req.body?.chunkSize || 250));
  res.json(result);
});

importsRouter.post('/jobs/:jobId/state', (req, res) => {
  const { action } = req.body;
  if (!['pause', 'resume', 'cancel'].includes(action)) return res.status(400).json({ error: 'invalid action' });
  setImportJobState(req.params.jobId, action);
  res.json({ ok: true });
});
