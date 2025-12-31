import { headers } from "next/headers";

type AnyRow = Record<string, any>;

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    throw new Error("Missing host header");
  }
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function fetchBuild(
  buildId: string
): Promise<{ build: AnyRow; runs: AnyRow[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/builds/${buildId}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function BuildDetailPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  const { build, runs } = await fetchBuild(buildId);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href="/builds">← Voltar</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
        Build {buildId}
      </h1>

      <h2 style={{ marginTop: 16 }}>Build</h2>
      <pre style={{ background: "#f6f6f6", padding: 12, overflowX: "auto" }}>
        {JSON.stringify(build, null, 2)}
      </pre>
      {build?.actor ? (
        <p style={{ marginTop: 8 }}>
          <strong>actor:</strong> {build.actor}
        </p>
      ) : null}

      <h2 style={{ marginTop: 16 }}>Runs</h2>
      <ul>
        {(runs ?? []).map((r: AnyRow) => (
          <li key={r.id}>
            <a href={`/runs/${r.id}`}>{r.id}</a>{" "}
            <span style={{ opacity: 0.7 }}>
              (layer: {r.layer ?? "-"}, suite: {r.suite ?? "-"}, status: {r.status ?? "-"})
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
