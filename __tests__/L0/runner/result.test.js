import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeResult } from '../../../runner/result.js';

const manifest = {
  build_id: 'b-1',
  tenant_key: 'tenant-x',
  repo: 'owner/repo',
  repo_slug: 'repo',
  sha: 'abc',
  commit_shas: [],
  authors: [],
};

const exec = {
  exitCode: 0,
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: 10,
  stdoutTail: 'ok',
  stderrTail: '',
};

describe('writeResult', () => {
  it('grava resultado em attempt e latest com metadados de contrato', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-artifacts-'));
    const prev = process.env.QA_ARTIFACT_DIR;
    process.env.QA_ARTIFACT_DIR = tmp;

    try {
      const { attemptPath, latestPath } = await writeResult({
        manifest,
        layer: 'L0',
        attempt: 2,
        result: {
          command: 'echo test',
          status: 'passed',
          exec,
          totals: null,
          failures: [],
        },
      });

      const attemptData = JSON.parse(await fs.readFile(attemptPath, 'utf8'));
      const latestData = JSON.parse(await fs.readFile(latestPath, 'utf8'));

      expect(attemptPath.startsWith(tmp)).toBe(true);
      expect(latestPath.startsWith(tmp)).toBe(true);

      expect(attemptData.contract_version).toBe('v1');
      expect(attemptData.schema_version).toBe('v1');
      expect(attemptData.attempt).toBe(2);
      expect(attemptData.layer).toBe('L0');
      expect(attemptData.status).toBe('passed');

      expect(latestData.attempt).toBe(2);
      expect(latestData.layer).toBe('L0');
    } finally {
      process.env.QA_ARTIFACT_DIR = prev;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
