// runner/index.js
import { buildManifest } from './manifest.js';
import { runLayer } from './exec.js';
import { writeResult } from './result.js';
import { publishToS3 } from './s3.js';
import { upsertBuild, recordRun, recordFailures, closeDb } from './persist.js';

function deriveStatus(l0, l1) {
  if (l0?.status === 'failed') return 'failed';
  if (l1 && l1?.status === 'failed') return 'failed';
  return 'passed';
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, cur, idx, arr) => {
      if (!cur.startsWith('--')) return acc;
      const key = cur.replace(/^--/, '');
      const val = arr[idx + 1] && !arr[idx + 1].startsWith('--') ? arr[idx + 1] : 'true';
      acc.push([key, val]);
      return acc;
    }, [])
  );

  const tenantKey = args.tenant;
  const repo = args.repo;
  const repoSlug = args.repoSlug;
  const buildId = args.buildId;
  const workdir = args.workdir;
  const s3Bucket = args.s3Bucket;
  const s3Prefix = args.s3Prefix;
  const l0Cmd = args.l0;
  const l1Cmd = args.l1;

  if (!tenantKey || !repo || !repoSlug || !buildId || !workdir || !s3Bucket || !s3Prefix || !l0Cmd) {
    throw new Error('missing_required_args');
  }

  const manifest = buildManifest({ tenantKey, repo, repoSlug, buildId, workdir });

  // 1) Marca build como running no DB (Neon)
  await upsertBuild({
    buildId: manifest.build_id,
    repo: manifest.repo,
    branch: manifest.branch,
    headSha: manifest.sha,
    shas: manifest.commit_shas,
    authors: manifest.authors,
    status: 'running',
  });

  let l0Result = null;
  let l1Result = null;

  try {
    // 2) Executa L0
    l0Result = await runLayer({ layer: 'L0', command: l0Cmd, cwd: workdir });
    const l0Path = await writeResult({ manifest, layer: 'L0', result: l0Result });
    const l0S3 = await publishToS3({ manifest, layer: 'L0', bucket: s3Bucket, prefix: s3Prefix, resultPath: l0Path });
    await recordRun({
      buildId: manifest.build_id,
      layer: 'L0',
      status: l0Result.status,
      durationMs: l0Result.exec?.durationMs,
      totals: l0Result.totals,
      s3ResultPath: l0S3 ? `s3://${l0S3.bucket}/${l0S3.key}` : null,
    });
    if (l0Result.failures?.length) {
      await recordFailures({ buildId: manifest.build_id, layer: 'L0', failures: l0Result.failures });
    }

    // 3) Executa L1 (opcional)
    if (l1Cmd && String(l1Cmd).trim()) {
      l1Result = await runLayer({ layer: 'L1', command: l1Cmd, cwd: workdir });
      const l1Path = await writeResult({ manifest, layer: 'L1', result: l1Result });
      const l1S3 = await publishToS3({ manifest, layer: 'L1', bucket: s3Bucket, prefix: s3Prefix, resultPath: l1Path });
      await recordRun({
        buildId: manifest.build_id,
        layer: 'L1',
        status: l1Result.status,
        durationMs: l1Result.exec?.durationMs,
        totals: l1Result.totals,
        s3ResultPath: l1S3 ? `s3://${l1S3.bucket}/${l1S3.key}` : null,
      });
      if (l1Result.failures?.length) {
        await recordFailures({ buildId: manifest.build_id, layer: 'L1', failures: l1Result.failures });
      }
    }

    // 4) Final status
    const finalStatus = deriveStatus(l0Result, l1Result);

    await upsertBuild({
      buildId: manifest.build_id,
      repo: manifest.repo,
      branch: manifest.branch,
      headSha: manifest.sha,
      shas: manifest.commit_shas,
      authors: manifest.authors,
      status: finalStatus,
      finishedAt: new Date().toISOString(),
    });

    if (finalStatus === 'failed') process.exitCode = 1;
  } catch (err) {
    // Se deu ruim no meio, marca failed no build e propaga exit code
    await upsertBuild({
      buildId: manifest.build_id,
      repo: manifest.repo,
      branch: manifest.branch,
      headSha: manifest.sha,
      shas: manifest.commit_shas,
      authors: manifest.authors,
      status: 'failed',
      finishedAt: new Date().toISOString(),
    });
    process.exitCode = 1;
    throw err;
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
