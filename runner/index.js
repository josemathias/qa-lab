// runner/index.js
import fs from 'node:fs/promises';
import path from 'node:path';

import { buildManifest } from './manifest.js';
import { runLayer } from './exec.js';
import { writeResult } from './result.js';
import { publishToS3, publishManifestToS3 } from './s3.js';
import { upsertBuild, recordRun, recordFailures, closeDb } from './persist.js';

function deriveStatus(l0, l1) {
  if (l0?.status === 'failed') return 'failed';
  if (l1 && l1?.status === 'failed') return 'failed';
  return 'passed';
}

const LOCAL_ARTIFACT_ROOT = '.qa-lab-artifacts';

function resolveAttempt(layer) {
  const layerEnv = process.env[`QA_ATTEMPT_${layer}`];
  const globalEnv = process.env.QA_ATTEMPT_ALL;
  const n = Number(layerEnv ?? globalEnv);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function writeManifestLocal(manifest) {
  const manifestDir = path.join(LOCAL_ARTIFACT_ROOT, manifest.build_id);
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
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

  // Publica manifest antes de qualquer layer (garante chave padronizada)
  const manifestPath = await writeManifestLocal(manifest);
  try {
    await publishManifestToS3({
      manifest,
      bucket: s3Bucket,
      prefix: s3Prefix,
    });
  } catch (err) {
    console.error('[qa-lab] publishManifestToS3 failed:', err?.message || err);
    // Não aborta execução de camadas, mas o erro será refletido nos runs se falhar upload
  }

  async function executeLayer({ layer, command }) {
    let result = null;
    let s3Info = null;
    let recorded = false;
    let publishError = null;
    const attempt = resolveAttempt(layer);
    const suite = process.env[`QA_SUITE_${layer}`] || layer;

    try {
      result = await runLayer({ layer, command, cwd: workdir });
      const { attemptPath } = await writeResult({ manifest, layer, attempt, result });

      try {
        s3Info = await publishToS3({
          manifest,
          layer,
          attempt,
          bucket: s3Bucket,
          prefix: s3Prefix,
          resultPath: attemptPath,
        });
      } catch (err) {
        publishError = err;
        console.error(`[qa-lab] publishToS3 failed for ${layer}:`, err?.message || err);
      }

      if (publishError && (!result.failures || !result.failures.length)) {
        result.failures = [
          {
            test_name: null,
            file_path: null,
            message_snippet: publishError?.message || String(publishError),
          },
        ];
        result.status = 'failed';
      }

        const runId = await recordRun({
          buildId: manifest.build_id,
          layer,
          status: result.status,
          durationMs: result.exec?.durationMs,
          totals: result.totals,
          s3ResultPath: s3Info ? `s3://${s3Info.bucket}/${s3Info.key}` : null,
          suite,
          metadata: {
            command,
            attempt,
            exit_code: result.exec?.exitCode ?? null,
            started_at: result.exec?.startedAt ?? null,
            finished_at: result.exec?.finishedAt ?? null,
          },
        });
      recorded = true;

      if (result.failures?.length) {
        await recordFailures({ buildId: manifest.build_id, layer, runId, failures: result.failures });
      }

      if (publishError) {
        throw publishError;
      }

      return result;
    } catch (err) {
      if (result && !result.failures?.length) {
        result.failures = [
          {
            test_name: null,
            file_path: null,
            message_snippet: err?.message || String(err),
          },
        ];
      }

      if (!recorded) {
        try {
          const runId = await recordRun({
            buildId: manifest.build_id,
            layer,
            status: 'failed',
            durationMs: result?.exec?.durationMs ?? null,
            totals: result?.totals ?? null,
            s3ResultPath: s3Info ? `s3://${s3Info.bucket}/${s3Info.key}` : null,
            suite,
            metadata: {
              command,
              attempt,
              exit_code: result?.exec?.exitCode ?? null,
              started_at: result?.exec?.startedAt ?? null,
              finished_at: result?.exec?.finishedAt ?? null,
            },
          });
          recorded = true;
          if (result?.failures?.length) {
            await recordFailures({ buildId: manifest.build_id, layer, runId, failures: result.failures });
          } else {
            await recordFailures({
              buildId: manifest.build_id,
              layer,
              runId,
              failures: [
                {
                  test_name: null,
                  file_path: null,
                  message_snippet: err?.message || String(err),
                },
              ],
            });
          }
        } catch (logErr) {
          console.error(`[qa-lab] failed to record ${layer} failure:`, logErr?.message || logErr);
        }
      }

      throw err;
    }
  }

  // 1) Marca build como running no DB (Neon)
  await upsertBuild({
    buildId: manifest.build_id,
    repo: manifest.repo,
    branch: manifest.branch,
    headSha: manifest.sha,
    shas: manifest.commit_shas,
    authors: manifest.authors,
    actor: manifest.actor,
    status: 'running',
  });

  let l0Result = null;
  let l1Result = null;

  try {
    // 2) Executa L0
    l0Result = await executeLayer({ layer: 'L0', command: l0Cmd });

    // 3) Executa L1 (opcional)
    if (l1Cmd && String(l1Cmd).trim()) {
      l1Result = await executeLayer({ layer: 'L1', command: l1Cmd });
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
      actor: manifest.actor,
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
      actor: manifest.actor,
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
