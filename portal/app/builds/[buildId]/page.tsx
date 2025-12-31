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
): Promise<{ build: AnyRow; runs: AnyRow[]; decisions: AnyRow[] }> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/builds/${buildId}`, {
    cache: "no-store",
  });
  const data = await res.json();

  const decRes = await fetch(
    `${baseUrl}/api/decisions?build_id=${encodeURIComponent(buildId)}`,
    { cache: "no-store" }
  );
  const decData = await decRes.json();

  return { ...data, decisions: decData.decisions ?? [] };
}

export default async function BuildDetailPage({
  params,
}: {
  params: Promise<{ buildId: string }>;
}) {
  const { buildId } = await params;
  const { build, runs, decisions } = await fetchBuild(buildId);

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

      <h2 style={{ marginTop: 16 }}>Decisions (build)</h2>
      {(decisions ?? []).length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhuma decisão registrada.</p>
      ) : (
        <ul>
          {decisions.map((d: AnyRow) => (
            <li key={d.id} style={{ marginBottom: 8 }}>
              <strong>{d.type}</strong> — actor: {d.actor ?? "-"} —{" "}
              <span style={{ opacity: 0.7 }}>
                run_id: {d.run_id ?? "-"} | layer: {d.layer ?? "-"} | created_at: {d.created_at ?? "-"}
              </span>
              {d.reason ? <div>Motivo: {d.reason}</div> : null}
            </li>
          ))}
        </ul>
      )}

      <h3 style={{ marginTop: 16 }}>Registrar decisão (demo)</h3>
      <form action="/api/decisions" method="post" style={{ marginTop: 8 }}>
        <input type="hidden" name="build_id" value={buildId} />
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
            Run ID:
            <input
              name="run_id"
              defaultValue={runs?.[0]?.id ?? ""}
              style={{ marginLeft: 8 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label>
            Layer:
            <input
              name="layer"
              defaultValue={runs?.[0]?.layer ?? ""}
              style={{ marginLeft: 8 }}
            />
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
