import { describe, it, expect, vi } from "vitest";

vi.mock("next/server", () => ({
  NextResponse: {
    json: (data: any, init?: any) => ({
      json: async () => data,
      status: init?.status ?? 200,
      body: data,
    }),
  },
}));

vi.mock("../../../portal/lib/db", () => {
  const rows: any[] = [];
  return {
    getPool: () => ({
      query: vi.fn(async (sql: string, params: any[]) => {
        if (sql.includes("insert into qa_decision")) {
          const obj = {
            id: rows.length + 1,
            build_id: params[0],
            run_id: params[1],
            layer: params[2],
            type: params[3],
            actor: params[4],
            reason: params[5],
            metadata: params[6],
            created_at: new Date().toISOString(),
          };
          rows.push(obj);
          return { rows: [obj] };
        }
        if (sql.includes("from qa_decision")) {
          return { rows };
        }
        return { rows: [] };
      }),
    }),
  };
});

const { GET: getDecisions, POST: postDecisions } = await import(
  "../../../portal/app/api/decisions/route"
);

describe("API decisions (Vitest L1)", () => {
  it("cria decisão via JSON e lista via GET", async () => {
    const payload = {
      build_id: "b-json",
      run_id: 42,
      layer: "L1",
      type: "issue_opened",
      actor: "vitest",
      reason: "bug",
    };

    const postRes = await postDecisions(
      new Request("http://localhost/api/decisions", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      })
    );
    const postJson = await postRes.json();
    expect(postJson.decision.type).toBe("issue_opened");

    const getRes = await getDecisions(
      new Request("http://localhost/api/decisions?build_id=b-json")
    );
    const getJson = await getRes.json();
    expect(getJson.decisions.length).toBeGreaterThan(0);
    expect(getJson.decisions[0].build_id).toBe("b-json");
  });
});
