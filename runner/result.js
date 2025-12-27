// runner/result.js
import fs from 'node:fs/promises';
import path from 'node:path';

const ARTIFACT_DIR = '.qa-lab-artifacts';

export function makeResult({ manifest, layer, command, status, exec, totals, failures }) {
  return {
    build_id: manifest.build_id,
    tenant_key: manifest.tenant_key,
    repo: manifest.repo,
    repo_slug: manifest.repo_slug,
    layer,
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

export async function writeResult({ manifest, layer, result }) {
  const payload = makeResult({
    manifest,
    layer,
    command: result.command,
    status: result.status,
    exec: result.exec,
    totals: result.totals,
    failures: result.failures,
  });

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });

  const filename = `${safeName(manifest.build_id)}-${safeName(layer)}.json`;
  const filePath = path.join(ARTIFACT_DIR, filename);

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');

  return filePath;
}
