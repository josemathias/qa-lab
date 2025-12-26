// runner/result.js
export function makeResult({
  manifest,
  layer,
  command,
  status,
  exec,
}) {
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
    logs: {
      stdout_tail: exec?.stdoutTail ?? '',
      stderr_tail: exec?.stderrTail ?? '',
    },
  };
}