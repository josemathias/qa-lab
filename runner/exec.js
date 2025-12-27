// runner/exec.js
import { spawn } from 'node:child_process';

function tailLines(text, maxLines = 200) {
  const lines = String(text || '').split('\n');
  return lines.slice(Math.max(0, lines.length - maxLines)).join('\n');
}

export async function execCommand(command, opts = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    shell = true,
    maxTailLines = 200,
  } = opts;

  const startedAt = new Date();
  const startMs = Date.now();

  return await new Promise((resolve) => {
    const child = spawn(command, { cwd, env, shell });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      const finishedAt = new Date();
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Date.now() - startMs,
        stdoutTail: tailLines(stdout, maxTailLines),
        stderrTail: tailLines(stderr, maxTailLines),
      });
    });

    child.on('error', (err) => {
      const finishedAt = new Date();
      resolve({
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Date.now() - startMs,
        stdoutTail: '',
        stderrTail: `spawn error: ${err?.message || String(err)}`,
      });
    });
  });
}

export async function runLayer({ layer, command, cwd }) {
  const exec = await execCommand(command, { cwd });
  const status = exec.exitCode === 0 ? 'passed' : 'failed';

  // Esqueleto de estatísticas padronizadas (a serem preenchidas por parsers específicos no futuro).
  const totals = {
    total: null,
    passed: null,
    failed: status === 'failed' ? null : null,
    skipped: null,
  };

  // Esqueleto de falhas (futuramente alimentado por parsers de JUnit/JSON específicos).
  const failures = status === 'failed'
    ? [
        {
          test_name: null,
          file_path: null,
          message_snippet: exec.stderrTail || exec.stdoutTail || 'Command failed',
        },
      ]
    : [];

  return {
    layer,
    command,
    status,
    exec,
    totals,
    failures,
  };
}
