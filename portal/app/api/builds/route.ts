import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/builds
 *
 * Schema facts (confirmed):
 * - qa_build columns: build_id, repo, branch, head_sha, commit_shas, authors, status, started_at, finished_at
 *
 * Optional query params:
 * - limit (default 50, max 200)
 */
export async function GET(req: Request) {
  const pool = getPool();

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1), 200);

  const sql = `
    select
      build_id,
      repo,
      branch,
      head_sha,
      commit_shas,
      authors,
      status,
      started_at,
      finished_at
    from qa_build
    order by started_at desc nulls last
    limit $1;
  `;

  const { rows } = await pool.query(sql, [limit]);
  return NextResponse.json({ builds: rows });
}