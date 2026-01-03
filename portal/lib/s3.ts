import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function clean(segment?: string | null) {
  return String(segment || "").replace(/^\/+|\/+$/g, "");
}

export function parseS3Url(url: string) {
  if (!url || !url.startsWith("s3://")) {
    throw new Error("URL S3 inválida");
  }
  const without = url.replace("s3://", "");
  const [bucket, ...rest] = without.split("/");
  return { bucket, key: rest.join("/") };
}

export function buildBasePrefixFromRun(run: { s3_result_path?: string; build_id?: string }) {
  if (!run?.s3_result_path || !run?.build_id) {
    throw new Error("run sem s3_result_path/build_id");
  }
  const { key } = parseS3Url(run.s3_result_path);
  const segments = key.split("/").filter(Boolean);
  const idx = segments.indexOf(run.build_id);
  if (idx === -1) throw new Error("build_id não encontrado no path S3");
  return segments.slice(0, idx + 1).join("/");
}

export function ensureKeyAllowed(key: string, allowedBase: string) {
  const k = clean(key);
  const base = clean(allowedBase);
  if (!k.startsWith(`${base}/`) && k !== base) {
    throw new Error("key fora do prefixo permitido");
  }
  if (k.includes("..")) {
    throw new Error("path inválido");
  }
  return k;
}

function getS3Client() {
  if (!process.env.AWS_REGION) throw new Error("AWS_REGION não definido");
  return new S3Client({ region: process.env.AWS_REGION });
}

export async function presignGetObject(key: string, expiresInSeconds = 300) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error("AWS_S3_BUCKET não definido");

  const client = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
}

export function cleanKey(key: string) {
  return clean(key);
}
