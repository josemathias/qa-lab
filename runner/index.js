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

  async function executeLayer({ layer, command }) {
    let result = null;
    let s3Info = null;
    let recorded = false;
    let publishError = null;

    try {
      result = await runLayer({ layer, command, cwd: workdir });
      const resultPath = await writeResult({ manifest, layer, result });

      try {
        s3Info = await publishToS3({
          manifest,
          layer,
          bucket: s3Bucket,
          prefix: s3Prefix,
          resultPath,
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

      await recordRun({
        buildId: manifest.build_id,
        layer,
        status: result.status,
        durationMs: result.exec?.durationMs,
        totals: result.totals,
        s3ResultPath: s3Info ? `s3://${s3Info.bucket}/${s3Info.key}` : null,
      });
      recorded = true;

      if (result.failures?.length) {
        await recordFailures({ buildId: manifest.build_id, layer, failures: result.failures });
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
          await recordRun({
            buildId: manifest.build_id,
            layer,
            status: 'failed',
            durationMs: result?.exec?.durationMs ?? null,
            totals: result?.totals ?? null,
            s3ResultPath: s3Info ? `s3://${s3Info.bucket}/${s3Info.key}` : null,
          });
          recorded = true;
          if (result?.failures?.length) {
            await recordFailures({ buildId: manifest.build_id, layer, failures: result.failures });
          } else {
            await recordFailures({
              buildId: manifest.build_id,
              layer,
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
