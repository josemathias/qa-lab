// runner/persist.js
import { pool } from './db.js';

function normalizeAuthors(authors) {
  return (authors || []).map((a) => {
    if (typeof a === 'string') return a;
    const name = a?.name || 'unknown';
    return a?.email ? `${name} <${a.email}>` : name;
  });
}

export async function upsertBuild({ buildId, repo, branch, headSha, shas, authors, status, finishedAt }) {
  await pool.query(
    `insert into qa_build
      (build_id, repo, branch, head_sha, commit_shas, authors, status, finished_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (build_id) do update
     set status = excluded.status,
         finished_at = excluded.finished_at`,
    [buildId, repo, branch, headSha, shas || [], normalizeAuthors(authors), status, finishedAt || null]
  );
}

export async function recordRun({ buildId, layer, status, durationMs, totals, s3ResultPath }) {
  await pool.query(
    `insert into qa_run
      (build_id, layer, status, duration_ms, totals, s3_result_path)
     values ($1,$2,$3,$4,$5,$6)`,
    [buildId, layer, status, durationMs ?? null, totals || null, s3ResultPath || null]
  );
}

export async function recordFailures({ buildId, layer, failures }) {
  const items = failures || [];
  if (!items.length) return;

  const text = `insert into qa_failure
      (build_id, layer, test_name, file_path, message_hash, message_snippet)
     values ($1,$2,$3,$4,$5,$6)`;

  for (const f of items) {
    await pool.query(text, [
      buildId,
      layer,
      f.test_name || null,
      f.file_path || null,
      f.message_hash || null,
      f.message_snippet || null,
    ]);
  }
}

export async function closeDb() {
  await pool.end();
}
