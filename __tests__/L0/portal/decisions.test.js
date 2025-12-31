import { describe, it, expect, vi, beforeEach } from '@jest/globals';

// Mock getPool for API route
vi.mock('../../../portal/lib/db', () => {
  const rows = [];
  return {
    getPool: () => ({
      query: vi.fn(async (sql, params) => {
        if (sql.includes('insert into qa_decision')) {
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
        if (sql.includes('from qa_decision')) {
          // return all for simplicity
          return { rows };
        }
        return { rows: [] };
      }),
    }),
  };
});

import { POST, GET } from '../../../portal/app/api/decisions/route';

describe('API /api/decisions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  it('creates and lists decisions', async () => {
    const payload = {
      build_id: 'b1',
      run_id: 1,
      layer: 'L0',
      type: 'waiver',
      actor: 'tester',
      reason: 'flaky',
      metadata: { note: 'manual waiver' },
    };

    const postRes = await POST(
      new Request('http://localhost/api/decisions', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
      })
    );
    const postJson = await postRes.json();
    expect(postJson.decision.build_id).toBe('b1');
    expect(postJson.decision.type).toBe('waiver');

    const getRes = await GET(new Request('http://localhost/api/decisions?build_id=b1'));
    const getJson = await getRes.json();
    expect(getJson.decisions.length).toBe(1);
    expect(getJson.decisions[0].actor).toBe('tester');
  });

  it('accepts form submissions', async () => {
    const body = new URLSearchParams({
      build_id: 'b2',
      run_id: '2',
      layer: 'L1',
      type: 'quarantine',
      actor: 'form-user',
      reason: 'demo',
    });

    const postRes = await POST(
      new Request('http://localhost/api/decisions', {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      })
    );
    const postJson = await postRes.json();
    expect(postJson.decision.build_id).toBe('b2');
    expect(postJson.decision.type).toBe('quarantine');
  });
});
