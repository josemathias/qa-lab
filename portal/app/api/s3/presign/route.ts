import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import {
  buildBasePrefixFromRun,
  cleanKey,
  ensureKeyAllowed,
  parseS3Url,
  presignGetObject,
} from "@/lib/s3";

const ALLOWED_PREFIXES = ["runs/", "logs/", "artifacts/"];

function isAllowedPath(path: string) {
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p));
}

async function parseBody(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await req.json()) as any;
  }
  const form = await req.formData();
  return Object.fromEntries(form.entries());
}

export async function POST(req: Request) {
  try {
    const body = await parseBody(req);
    const pool = getPool();
    const requestedKey = body?.key ? cleanKey(String(body.key)) : null;
    const buildId = body?.build_id ? String(body.build_id) : null;
    const runId = body?.run_id ? Number(body.run_id) : null;
    const layer = body?.layer ? String(body.layer) : null;
    const artifactPath = body?.artifact_path ? cleanKey(String(body.artifact_path)) : null;
    const expires = Math.min(Math.max(Number(body?.expires_in) || 600, 60), 1800); // clamp 1-30 min

    let keyToSign = requestedKey;
    let allowedBase: string | null = null;
    let bucketFromRun: string | null = null;

    if (runId) {
      const runRes = await pool.query(
        `select id, build_id, layer, s3_result_path from qa_run where id = $1 limit 1`,
        [runId]
      );
      const run = runRes.rows[0];
      if (!run) {
        return NextResponse.json({ error: "run_id não encontrado" }, { status: 404 });
      }
      if (buildId && run.build_id !== buildId) {
        return NextResponse.json({ error: "build_id não corresponde ao run_id" }, { status: 400 });
      }
      const { bucket } = parseS3Url(run.s3_result_path);
      bucketFromRun = bucket;
      allowedBase = buildBasePrefixFromRun(run);
      if (!keyToSign && artifactPath) {
        if (!isAllowedPath(artifactPath)) {
          return NextResponse.json({ error: "artifact_path não permitido" }, { status: 400 });
        }
        keyToSign = `${allowedBase}/${artifactPath}`;
      }
    }

    if (!keyToSign && buildId && artifactPath) {
      // Fallback: buildId + artifactPath (menos seguro que run_id)
      const prefix = (process.env.QA_S3_PREFIX || "").replace(/^\/+|\/+$/g, "");
      keyToSign = [prefix, buildId, artifactPath].filter(Boolean).join("/");
      allowedBase = [prefix, buildId].filter(Boolean).join("/");
    }

    if (!keyToSign) {
      return NextResponse.json(
        { error: "Informe key ou (run_id/build_id + artifact_path)" },
        { status: 400 }
      );
    }

    if (allowedBase) {
      try {
        keyToSign = ensureKeyAllowed(keyToSign, allowedBase);
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || "key inválida" }, { status: 400 });
      }
    }

    if (!isAllowedPath(keyToSign.split("/").slice(-3).join("/")) && !keyToSign.includes("/runs/")) {
      // Quick allow for typical paths; relax if needed
      // still allow logs/artifacts
      const okPrefix = ALLOWED_PREFIXES.some((p) => keyToSign.includes(`/${p}`));
      if (!okPrefix) {
        return NextResponse.json({ error: "path não permitido" }, { status: 400 });
      }
    }

    const url = await presignGetObject(keyToSign, expires);

    // Optional: log basic info
    console.log("[presign]", {
      key: keyToSign,
      runId,
      buildId,
      layer: layer || null,
      expires,
      bucket: bucketFromRun || process.env.AWS_S3_BUCKET,
    });

    return NextResponse.json({ url, expires_in: expires });
  } catch (err: any) {
    console.error("[presign] error", err?.message || err);
    return NextResponse.json({ error: err?.message || "internal_error" }, { status: 500 });
  }
}
