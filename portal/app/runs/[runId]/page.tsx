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
): Promise<{ run: AnyRow | null; failures: AnyRow[]; decisions: AnyRow[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/runs/${runId}`, {
    cache: "no-store",
  });
  const data = await res.json();

  // Fetch decisions for this run
  const decRes = await fetch(
    `${baseUrl}/api/decisions?run_id=${encodeURIComponent(runId)}`,
    { cache: "no-store" }
  );
  const decData = await decRes.json();

  return { ...data, decisions: decData.decisions ?? [] };
}

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  // Next.js 16: params is a Promise
  const { runId } = await params;
  const { run, failures, decisions } = await fetchRun(runId);

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

      <h2 style={{ marginTop: 16 }}>Decisions (run)</h2>
      {(decisions ?? []).length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhuma decisão registrada para esta run.</p>
      ) : (
        <ul>
          {decisions.map((d: AnyRow) => (
            <li key={d.id} style={{ marginBottom: 8 }}>
              <strong>{d.type}</strong> — actor: {d.actor ?? "-"} —{" "}
              <span style={{ opacity: 0.7 }}>
                build_id: {d.build_id ?? "-"} | layer: {d.layer ?? "-"} | created_at: {d.created_at ?? "-"}
              </span>
              {d.reason ? <div>Motivo: {d.reason}</div> : null}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 16 }}>Registrar decisão (run)</h3>
      <form action="/api/decisions" method="post" style={{ marginTop: 8 }}>
        <input type="hidden" name="build_id" value={run?.build_id ?? ""} />
        <input type="hidden" name="run_id" value={run?.id ?? ""} />
        <input type="hidden" name="layer" value={run?.layer ?? ""} />
        <div style={{ marginBottom: 8 }}>
          <label>
            Tipo:
            <select name="type" defaultValue="waiver" style={{ marginLeft: 8 }}>
              <option value="waiver">waiver</option>
              <option value="quarantine">quarantine</option>
              <option value="rerun_request">rerun_request</option>
              <option value="issue_opened">issue_opened</option>
              <option value="patch_suggested">patch_suggested</option>
            </select>
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Actor:
            <input name="actor" defaultValue="portal-user" style={{ marginLeft: 8 }} />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Motivo:
            <input name="reason" placeholder="motivo opcional" style={{ marginLeft: 8 }} />
          </label>
        </div>
        <button type="submit">Registrar</button>
      </form>
    </main>
  );
}
