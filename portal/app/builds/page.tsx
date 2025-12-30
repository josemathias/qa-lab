import { headers } from "next/headers";

type BuildRow = {
  build_id: string;
  repo?: string;
  branch?: string;
  head_sha?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
};

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    throw new Error("Missing host header");
  }
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function fetchBuilds(): Promise<BuildRow[]> {
  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/builds`, {
    cache: "no-store",
  });
  const data = await res.json();
  return data.builds ?? [];
}

export default async function BuildsPage() {
  const builds = await fetchBuilds();

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Builds</h1>
      <p style={{ opacity: 0.7 }}>
        Lista MVP de builds carregada diretamente do Neon.
      </p>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: 16,
        }}
      >
        <thead>
          <tr>
            {[
              "build_id",
              "repo",
              "branch",
              "status",
              "started_at",
              "finished_at",
            ].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #ddd",
                  padding: 8,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {builds.map((b) => (
            <tr key={b.build_id}>
              <td style={{ padding: 8 }}>
                <a href={`/builds/${b.build_id}`}>{b.build_id}</a>
              </td>
              <td style={{ padding: 8 }}>{b.repo ?? "-"}</td>
              <td style={{ padding: 8 }}>{b.branch ?? "-"}</td>
              <td style={{ padding: 8 }}>{b.status ?? "-"}</td>
              <td style={{ padding: 8 }}>{b.started_at ?? "-"}</td>
              <td style={{ padding: 8 }}>{b.finished_at ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16 }}>
        <a href="/runs">Ver runs →</a>
      </div>
    </main>
  );
}