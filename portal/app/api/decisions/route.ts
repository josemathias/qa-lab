import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const VALID_TYPES = new Set([
  "waiver",
  "quarantine",
  "rerun_request",
  "issue_opened",
  "patch_suggested",
]);

type DecisionPayload = {
  build_id: string;
  run_id?: number | null;
  layer?: string | null;
  type: string;
  actor?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
};

export async function POST(req: Request) {
  const pool = getPool();
  const body = (await req.json()) as DecisionPayload;

  if (!body?.build_id || !body?.type) {
    return NextResponse.json({ error: "build_id and type are required" }, { status: 400 });
  }
  if (!VALID_TYPES.has(body.type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  const sql = `
    insert into qa_decision
      (build_id, run_id, layer, type, actor, reason, metadata)
    values ($1,$2,$3,$4,$5,$6,$7)
    returning *;
  `;

  const res = await pool.query(sql, [
    body.build_id,
    body.run_id ?? null,
    body.layer ?? null,
    body.type,
    body.actor ?? null,
    body.reason ?? null,
    body.metadata ?? null,
  ]);

  return NextResponse.json({ decision: res.rows[0] });
}

export async function GET(req: Request) {
  const pool = getPool();
  const url = new URL(req.url);
  const buildId = url.searchParams.get("build_id");
  const runIdRaw = url.searchParams.get("run_id");
  const runId = runIdRaw ? Number(runIdRaw) : null;

  const conditions: string[] = [];
  const params: any[] = [];
  if (buildId) {
    params.push(buildId);
    conditions.push(`build_id = $${params.length}`);
  }
  if (runId && Number.isFinite(runId)) {
    params.push(runId);
    conditions.push(`run_id = $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  const sql = `
    select
      id,
      build_id,
      run_id,
      layer,
      type,
      actor,
      reason,
      metadata,
      created_at
    from qa_decision
    ${where}
    order by created_at desc
    limit 200;
  `;

  const res = await pool.query(sql, params);
  return NextResponse.json({ decisions: res.rows });
}
