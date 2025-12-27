// runner/s3.js
import fs from 'node:fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export function getS3Client() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2';
  return new S3Client({ region });
}

export async function putJson({ bucket, key, obj }) {
  const s3 = getS3Client();
  const body = JSON.stringify(obj, null, 2);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/json; charset=utf-8',
    })
  );

  return { bucket, key };
}

export function buildS3Key({ prefix, tenantKey, repoSlug, buildId, path }) {
  const p = (prefix || 'dev').replace(/^\/+|\/+$/g, '');
  const clean = (s) => String(s || '').replace(/^\/+|\/+$/g, '');
  return `${clean(p)}/${clean(tenantKey)}/${clean(repoSlug)}/${clean(buildId)}/${clean(path)}`;
}

export async function publishToS3({ manifest, layer, bucket, prefix, resultPath }) {
  const payload = JSON.parse(await fs.readFile(resultPath, 'utf8'));

  const key = buildS3Key({
    prefix,
    tenantKey: manifest.tenant_key,
    repoSlug: manifest.repo_slug,
    buildId: manifest.build_id,
    path: `results/${layer}.json`,
  });

  await putJson({ bucket, key, obj: payload });

  return { bucket, key };
}
