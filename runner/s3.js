// runner/s3.js
import fs from 'node:fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export function clean(segment) {
  return String(segment || '').replace(/^\/+|\/+$/g, '');
}

export function basePrefix({ prefix }) {
  return clean(prefix || 'dev');
}

export function baseKey({ prefix, tenantKey, repoSlug, buildId }) {
  return `${basePrefix({ prefix })}/${clean(tenantKey)}/${clean(repoSlug)}/${clean(buildId)}`;
}

export function resultKey({ base, layer, attempt }) {
  return `${base}/runs/${clean(layer)}/attempt-${attempt}/result.json`;
}

export function resultAliasKey({ base, layer }) {
  return `${base}/runs/${clean(layer)}/latest/result.json`;
}

export function manifestKey({ base }) {
  return `${base}/manifest.json`;
}

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

// Deprecated helper kept for compatibility (returns base/key combined path)
export function buildS3Key({ prefix, tenantKey, repoSlug, buildId, path }) {
  const base = baseKey({ prefix, tenantKey, repoSlug, buildId });
  return `${base}/${clean(path)}`;
}

export async function publishManifestToS3({ manifest, bucket, prefix, putJsonFn = putJson }) {
  const key = manifestKey({
    base: baseKey({
      prefix,
      tenantKey: manifest.tenant_key,
      repoSlug: manifest.repo_slug,
      buildId: manifest.build_id,
    }),
  });

  await putJsonFn({ bucket, key, obj: manifest });
  return { bucket, key };
}

export async function publishToS3({
  manifest,
  layer,
  bucket,
  prefix,
  resultPath,
  attempt = 1,
  putJsonFn = putJson,
}) {
  const payload = JSON.parse(await fs.readFile(resultPath, 'utf8'));

  const base = baseKey({
    prefix,
    tenantKey: manifest.tenant_key,
    repoSlug: manifest.repo_slug,
    buildId: manifest.build_id,
  });

  const attemptKey = resultKey({ base, layer, attempt });
  const aliasKey = resultAliasKey({ base, layer });

  await putJsonFn({ bucket, key: attemptKey, obj: payload });
  await putJsonFn({ bucket, key: aliasKey, obj: payload });

  return { bucket, key: attemptKey, aliasKey };
}
