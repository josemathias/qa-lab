import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/runs/:runId
 *
 * Schema facts (confirmed):
 * - qa_run primary key is `id` (bigserial), NOT run_id
 * - qa_failure does NOT reference qa_run.id
 * - qa_failure is linked by (build_id, layer)
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> } | { params: { runId: string } }
) {
  const pool = getPool();

  // Next.js 16: params may be a Promise (sync dynamic APIs)
  const paramsAny = (ctx as any).params;
  const awaitedParams =
    paramsAny && typeof paramsAny.then === "function"
      ? await paramsAny
      : paramsAny;

  const runIdRaw = awaitedParams?.runId;

  if (!runIdRaw) {
    return NextResponse.json(
      { error: "Missing runId param" },
      { status: 400 }
    );
  }

  const runId = Number(runIdRaw);
  if (!Number.isFinite(runId)) {
    return NextResponse.json(
      { error: "runId must be qa_run.id (number)" },
      { status: 400 }
    );
  }

  // 1) Fetch the run by qa_run.id
  const runSql = `
    select
      id,
      build_id,
      layer,
      status,
      duration_ms,
      totals,
      s3_result_path,
      suite,
      metadata,
      created_at
    from qa_run
    where id = $1
    limit 1;
  `;

  const runRes = await pool.query(runSql, [runId]);
  const run = runRes.rows[0] ?? null;

  if (!run) {
    return NextResponse.json({ run: null, failures: [] });
  }

  // 2) Fetch failures using run_id when available, fallback to (build_id, layer) for legado
  const failuresSql = `
    select
      id,
      build_id,
      layer,
      run_id,
      test_name,
      file_path,
      message_hash,
      message_snippet,
      created_at
    from qa_failure
    where (run_id = $1)
       or (run_id is null and build_id = $2 and layer = $3)
    order by created_at asc;
  `;

  const failRes = await pool.query(failuresSql, [
    run.id,
    run.build_id,
    run.layer,
  ]);

  return NextResponse.json({
    run,
    failures: failRes.rows,
  });
}
