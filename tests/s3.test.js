import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  baseKey,
  basePrefix,
  buildS3Key,
  manifestKey,
  publishManifestToS3,
  publishToS3,
  resultAliasKey,
  resultKey,
} from '../runner/s3.js';

const manifest = {
  build_id: 'build-123',
  tenant_key: 'tenant-x',
  repo_slug: 'repo-y',
  repo: 'owner/repo-y',
  sha: 'abc',
  commit_shas: [],
  authors: [],
};

describe('s3 key helpers', () => {
  it('builds base and result keys with prefix, tenant, repo and build', () => {
    const base = baseKey({
      prefix: 'dev',
      tenantKey: 'tenant-x',
      repoSlug: 'repo-y',
      buildId: 'build-123',
    });
    expect(base).toBe('dev/tenant-x/repo-y/build-123');

    const attemptKey = resultKey({ base, layer: 'L0', attempt: 2 });
    expect(attemptKey).toBe('dev/tenant-x/repo-y/build-123/runs/L0/attempt-2/result.json');

    const aliasKey = resultAliasKey({ base, layer: 'L0' });
    expect(aliasKey).toBe('dev/tenant-x/repo-y/build-123/runs/L0/latest/result.json');

    const mKey = manifestKey({ base });
    expect(mKey).toBe('dev/tenant-x/repo-y/build-123/manifest.json');
  });

  it('keeps buildS3Key compatibility', () => {
    const key = buildS3Key({
      prefix: 'dev',
      tenantKey: 'tenant-x',
      repoSlug: 'repo-y',
      buildId: 'build-123',
      path: 'runs/L0/attempt-1/result.json',
    });
    expect(key).toBe('dev/tenant-x/repo-y/build-123/runs/L0/attempt-1/result.json');
  });

  it('normalizes prefix and strips slashes', () => {
    const base = basePrefix({ prefix: '/dev/' });
    expect(base).toBe('dev');
  });
});

describe('publish helpers', () => {
  it('publishes manifest to the correct key', async () => {
    const calls = [];
    const putJsonFn = async (input) => {
      calls.push(input);
      return input;
    };

    const res = await publishManifestToS3({
      manifest,
      bucket: 'qa-bucket',
      prefix: 'dev',
      putJsonFn,
    });

    expect(res.key).toBe('dev/tenant-x/repo-y/build-123/manifest.json');
    expect(calls).toHaveLength(1);
    expect(calls[0].bucket).toBe('qa-bucket');
    expect(calls[0].key).toBe(res.key);
    expect(calls[0].obj.build_id).toBe('build-123');
  });

  it('publishes attempt and alias keys for results', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-lab-test-'));
    const resultPath = path.join(tmp, 'result.json');
    await fs.writeFile(resultPath, JSON.stringify({ ok: true }), 'utf8');

    const calls = [];
    const putJsonFn = async (input) => {
      calls.push(input);
      return input;
    };

    const res = await publishToS3({
      manifest,
      layer: 'L1',
      bucket: 'qa-bucket',
      prefix: 'dev',
      resultPath,
      attempt: 3,
      putJsonFn,
    });

    expect(res.key).toBe('dev/tenant-x/repo-y/build-123/runs/L1/attempt-3/result.json');
    expect(res.aliasKey).toBe('dev/tenant-x/repo-y/build-123/runs/L1/latest/result.json');
    expect(calls).toHaveLength(2);
    const keys = calls.map((c) => c.key);
    expect(keys).toContain(res.key);
    expect(keys).toContain(res.aliasKey);
  });
});
