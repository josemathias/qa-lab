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

/**
 * Fetch run details + failures from API
 * GET /api/runs/:runId
 */
async function fetchRun(
  runId: string
): Promise<{ run: AnyRow | null; failures: AnyRow[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/runs/${runId}`, {
    cache: "no-store",
  });
  return res.json();
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  // Next.js 16: params is a Promise
  const { runId } = await params;
  const { run, failures } = await fetchRun(runId);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href="/runs">← Runs</a>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>
        Run {runId}
      </h1>

      <h2 style={{ marginTop: 16 }}>Run</h2>
      <pre style={{ background: "#f6f6f6", padding: 12, overflowX: "auto" }}>
        {JSON.stringify(run, null, 2)}
      </pre>
      {run?.suite ? (
        <p style={{ marginTop: 8 }}>
          <strong>suite:</strong> {run.suite}
        </p>
      ) : null}
      {run?.metadata ? (
        <pre style={{ background: "#eef6ff", padding: 12, overflowX: "auto" }}>
          {JSON.stringify(run.metadata, null, 2)}
        </pre>
      ) : null}

      <h2 style={{ marginTop: 16 }}>Failures</h2>
      {(failures ?? []).length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhuma falha registrada para esta run.</p>
      ) : (
        <ol>
          {failures.map((f, idx) => (
            <li key={f.id ?? idx} style={{ marginBottom: 12 }}>
              <pre
                style={{
                  background: "#fff2f2",
                  padding: 12,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(f, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
