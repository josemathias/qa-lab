import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/builds/:buildId
 *
 * Schema facts (confirmed):
 * - qa_build primary key is `build_id` (text)
 * - qa_run references builds via `build_id`
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ buildId: string }> } | { params: { buildId: string } }
) {
  const pool = getPool();

  // Next.js 16: params may be a Promise (sync dynamic APIs)
  const paramsAny = (ctx as any).params;
  const awaitedParams =
    paramsAny && typeof paramsAny.then === "function"
      ? await paramsAny
      : paramsAny;

  const buildId: string | undefined = awaitedParams?.buildId;

  if (!buildId) {
    return NextResponse.json(
      { error: "Missing buildId param" },
      { status: 400 }
    );
  }

  // 1) Fetch build
  const buildSql = `
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
    where build_id = $1
    limit 1;
  `;

  // 2) Fetch runs for this build
  const runsSql = `
    select
      id,
      build_id,
      layer,
      status,
      duration_ms,
      totals,
      s3_result_path,
      created_at
    from qa_run
    where build_id = $1
    order by created_at asc;
  `;

  const [buildRes, runsRes] = await Promise.all([
    pool.query(buildSql, [buildId]),
    pool.query(runsSql, [buildId]),
  ]);

  return NextResponse.json({
    build: buildRes.rows[0] || null,
    runs: runsRes.rows,
  });
}