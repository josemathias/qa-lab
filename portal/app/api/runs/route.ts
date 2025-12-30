import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/runs
 *
 * Returns { runs } from qa_run ordered by created_at desc.
 *
 * Optional query params:
 * - limit (default 50, max 200)
 * - build_id
 * - layer
 * - status
 */
export async function GET(req: Request) {
  const pool = getPool();

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1), 200);

  const buildId = url.searchParams.get("build_id");
  const layer = url.searchParams.get("layer");
  const status = url.searchParams.get("status");

  const conditions: string[] = [];
  const params: any[] = [];

  if (buildId) {
    params.push(buildId);
    conditions.push(`build_id = $${params.length}`);
  }
  if (layer) {
    params.push(layer);
    conditions.push(`layer = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  params.push(limit);

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const sql = `
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
    ${where}
    order by created_at desc
    limit $${params.length};
  `;

  const { rows } = await pool.query(sql, params);
  return NextResponse.json({ runs: rows });
}