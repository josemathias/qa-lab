import { headers } from "next/headers";

type RunRow = {
  id: number; // qa_run.id is bigserial (number)
  build_id?: string;
  layer?: string;
  suite?: string;
  status?: string;
  metadata?: Record<string, any>;
  duration_ms?: number;
  created_at?: string;
};

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  if (!host) throw new Error("Missing host header");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function fetchRuns(): Promise<RunRow[]> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/runs`, { cache: "no-store" });
  const data = await res.json();
  return data.runs ?? [];
}

export default async function RunsIndexPage() {
  const runs = await fetchRuns();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <a href="/builds">← Builds</a>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12 }}>Runs</h1>
      <p style={{ opacity: 0.7 }}>
        Índice MVP: lista as runs mais recentes diretamente do Neon.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr>
            {["id", "build_id", "layer", "suite", "status", "duration_ms", "created_at"].map((h) => (
              <th
                key={h}
                style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: 8 }}>
                <a href={`/runs/${r.id}`}>{r.id}</a>
              </td>
              <td style={{ padding: 8 }}>{r.build_id ?? "-"}</td>
              <td style={{ padding: 8 }}>{r.layer ?? "-"}</td>
              <td style={{ padding: 8 }}>{r.suite ?? "-"}</td>
              <td style={{ padding: 8 }}>{r.status ?? "-"}</td>
              <td style={{ padding: 8 }}>{r.duration_ms ?? "-"}</td>
              <td style={{ padding: 8 }}>{r.created_at ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
