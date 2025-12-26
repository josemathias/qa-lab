// runner/index.js
import { execCommand } from './exec.js';
import { buildManifest } from './manifest.js';
import { makeResult } from './result.js';
import { putJson, buildS3Key } from './s3.js';

function arg(name, def = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  return process.argv[i + 1] ?? def;
}

function required(name) {
  const v = arg(name);
  if (!v) throw new Error(`Missing --${name}`);
  return v;
}

function normalizeRepoSlug(repoSlug, repoFull) {
  // se vier "owner/repo", usa só "repo" como slug default, mas aceita qualquer coisa
  if (repoSlug) return repoSlug;
  const parts = String(repoFull || '').split('/');
  return parts[1] || parts[0] || 'repo';
}

async function run() {
  const tenantKey = required('tenant');
  const repo = required('repo'); // owner/repo
  const repoSlug = normalizeRepoSlug(arg('repoSlug'), repo);
  const buildId = required('buildId');
  const workdir = arg('workdir', process.cwd());
  const bucket = required('s3Bucket');
  const prefix = arg('s3Prefix', 'dev');

  const l0 = arg('l0', '');
  const l1 = arg('l1', '');

  const manifest = buildManifest({ tenantKey, repo, repoSlug, buildId, workdir });

  // 1) upload manifest
  const manifestKey = buildS3Key({ prefix, tenantKey, repoSlug, buildId, path: 'manifest.json' });
  await putJson({ bucket, key: manifestKey, obj: manifest });

  // 2) L0
  let l0Result;
  if (l0) {
    const exec = await execCommand(l0, { cwd: workdir });
    const status = exec.exitCode === 0 ? 'passed' : 'failed';
    l0Result = makeResult({ manifest, layer: 'L0', command: l0, status, exec });

    const key = buildS3Key({ prefix, tenantKey, repoSlug, buildId, path: 'L0/result.json' });
    await putJson({ bucket, key, obj: l0Result });
  } else {
    l0Result = makeResult({ manifest, layer: 'L0', command: '', status: 'skipped', exec: null });
    const key = buildS3Key({ prefix, tenantKey, repoSlug, buildId, path: 'L0/result.json' });
    await putJson({ bucket, key, obj: l0Result });
  }

  // 3) L1 (opcional)
  if (l1) {
    const exec = await execCommand(l1, { cwd: workdir });
    const status = exec.exitCode === 0 ? 'passed' : 'failed';
    const l1Result = makeResult({ manifest, layer: 'L1', command: l1, status, exec });

    const key = buildS3Key({ prefix, tenantKey, repoSlug, buildId, path: 'L1/result.json' });
    await putJson({ bucket, key, obj: l1Result });

    // falhar o job se L0 ou L1 falhar
    if (l0Result.status !== 'passed' || l1Result.status !== 'passed') process.exit(1);
    return;
  }

  // falhar o job se L0 falhar
  if (l0Result.status !== 'passed') process.exit(1);
}

run().catch((err) => {
  console.error('[qa-lab-runner] fatal:', err);
  process.exit(1);
});