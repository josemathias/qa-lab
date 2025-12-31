// runner/result.js
import fs from 'node:fs/promises';
import path from 'node:path';

const ARTIFACT_DIR = '.qa-lab-artifacts';
const CONTRACT_VERSION = 'v1';
const RESULT_SCHEMA_VERSION = 'v1';

export function makeResult({ manifest, layer, attempt, command, status, exec, totals, failures }) {
  return {
    contract_version: CONTRACT_VERSION,
    schema_version: RESULT_SCHEMA_VERSION,
    build_id: manifest.build_id,
    tenant_key: manifest.tenant_key,
    repo: manifest.repo,
    repo_slug: manifest.repo_slug,
    layer,
    attempt,
    status, // passed | failed | skipped
    exit_code: exec?.exitCode ?? null,
    started_at: exec?.startedAt ?? null,
    finished_at: exec?.finishedAt ?? null,
    duration_ms: exec?.durationMs ?? null,
    command,
    sha: manifest.sha,
    commit_shas: manifest.commit_shas,
    authors: manifest.authors,
    totals: totals || {
      total: null,
      passed: null,
      failed: null,
      skipped: null,
    },
    failures: failures || [],
    logs: {
      stdout_tail: exec?.stdoutTail ?? '',
      stderr_tail: exec?.stderrTail ?? '',
    },
  };
}

function safeName(text) {
  return String(text || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function writeResult({ manifest, layer, attempt = 1, result }) {
  const payload = makeResult({
    manifest,
    layer,
    attempt,
    command: result.command,
    status: result.status,
    exec: result.exec,
    totals: result.totals,
    failures: result.failures,
  });

  const attemptDir = path.join(
    ARTIFACT_DIR,
    safeName(manifest.build_id),
    safeName(layer),
    `attempt-${attempt}`
  );
  const latestDir = path.join(ARTIFACT_DIR, safeName(manifest.build_id), safeName(layer), 'latest');

  await fs.mkdir(attemptDir, { recursive: true });
  await fs.mkdir(latestDir, { recursive: true });

  const attemptPath = path.join(attemptDir, 'result.json');
  const latestPath = path.join(latestDir, 'result.json');

  const serialized = JSON.stringify(payload, null, 2);
  await fs.writeFile(attemptPath, serialized, 'utf8');
  await fs.writeFile(latestPath, serialized, 'utf8');

  return { attemptPath, latestPath };
}
