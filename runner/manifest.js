// runner/manifest.js
import { execSync } from 'node:child_process';

const CONTRACT_VERSION = 'v1';
const MANIFEST_SCHEMA_VERSION = 'v1';

function safeExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function buildManifest({ tenantKey, repo, repoSlug, buildId, workdir }) {
  const cwd = workdir || process.cwd();

  const sha = safeExec('git rev-parse HEAD', cwd) || process.env.GITHUB_SHA || '';
  // Heurística simples: pega últimos commits do branch. Depois a gente melhora para PR merge-base etc.
  const commitList = safeExec('git log -n 50 --pretty=format:%H', cwd);
  const commitShas = uniq(commitList.split('\n')).slice(0, 50);

  const authorsRaw = safeExec('git log -n 50 --pretty=format:%an <%ae>', cwd);
  const authors = uniq(authorsRaw.split('\n'))
    .slice(0, 50)
    .map((s) => {
      const m = s.match(/^(.*)\s<([^>]+)>$/);
      return m ? { name: m[1], email: m[2] } : { name: s, email: '' };
    });

  return {
    contract_version: CONTRACT_VERSION,
    schema_version: MANIFEST_SCHEMA_VERSION,
    build_id: String(buildId),
    tenant_key: tenantKey,
    repo,
    repo_slug: repoSlug,
    actor: process.env.GITHUB_ACTOR || '',
    sha,
    commit_shas: commitShas,
    authors,
    branch: process.env.GITHUB_REF_NAME || '',
    workflow: process.env.GITHUB_WORKFLOW || '',
    run_id: process.env.GITHUB_RUN_ID || '',
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || '',
    created_at: new Date().toISOString(),
  };
}
