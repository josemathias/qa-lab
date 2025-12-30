import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export function buildS3Key(parts: {
  repo?: string;
  branch?: string;
  buildId?: string;
  path: string; // ex: "results/L0.json"
}) {
  const prefix = (process.env.QA_S3_PREFIX || "").replace(/\/+$/, "");
  const segs = [prefix, parts.repo, parts.branch, parts.buildId, parts.path]
    .filter(Boolean)
    .map((s) => String(s).replace(/^\/+|\/+$/g, ""));
  return segs.join("/");
}