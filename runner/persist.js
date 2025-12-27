// runner/persist.js
import { pool } from './db.js';

export async function upsertBuild({ buildId, repo, branch, headSha, shas, authors, status }) {
  await pool.query(
    `insert into qa_build
      (build_id, repo, branch, head_sha, commit_shas, authors, status)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (build_id) do update
     set status = excluded.status`,
    [buildId, repo, branch, headSha, shas, authors, status]
  );
}

export async function closeDb() {
  await pool.end();
}