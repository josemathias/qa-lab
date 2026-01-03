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

const mockRows: any[] = [
  {
    id: 10,
    build_id: "b1",
    layer: "L0",
    s3_result_path: "s3://qa-lab-results-dev/dev/tenant/repo/b1/runs/L0/attempt-1/result.json",
  },
];

vi.mock("../../../portal/lib/db", () => ({
  getPool: () => ({
    query: vi.fn(async () => ({ rows: mockRows })),
  }),
}));

const presignSpy = vi.fn(async () => "http://signed-url");
vi.mock("../../../portal/lib/s3", async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    presignGetObject: presignSpy,
  };
});

const { POST } = await import("../../../portal/app/api/s3/presign/route");

describe("API /api/s3/presign", () => {
  it("gera URL assinada usando run_id + artifact_path", async () => {
    const res = await POST(
      new Request("http://localhost/api/s3/presign", {
        method: "POST",
        body: JSON.stringify({
          run_id: 10,
          artifact_path: "runs/L0/attempt-1/logs/runner.log",
        }),
        headers: { "content-type": "application/json" },
      })
    );

    const json = await res.json();
    expect(json.url).toBe("http://signed-url");
    expect(presignSpy).toHaveBeenCalled();
    const keyArg = presignSpy.mock.calls[0][0];
    expect(keyArg).toContain("dev/tenant/repo/b1/runs/L0/attempt-1/logs/runner.log");
  });
});
