import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

// Runtime checks use no database or provider credentials. They intentionally
// prove unauthenticated requests are rejected before touching external storage.
const port = 4319;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, ADMIN_PASSWORD: 'synthetic-smoke-password', STUDENT_TOKEN_SECRET: 'synthetic-smoke-signing-key',
    SUPABASE_SERVICE_ROLE_KEY: '', NEXT_PUBLIC_SUPABASE_URL: '', DEEPSEEK_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', YOUTUBE_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = new Promise(resolve => server.once('exit', resolve));
let logs = '';
server.stdout.on('data', data => { logs += data; });
server.stderr.on('data', data => { logs += data; });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    if (server.exitCode !== null) throw new Error(`Server stopped: ${logs}`);
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Server did not start: ${logs}`);
  const id = '00000000-0000-4000-8000-000000000001';
  for (const path of ['/api/events', '/api/students', `/api/students/${id}`, `/api/lessons/${id}`, `/api/lessons?studentId=${id}`, `/api/student-tools?studentId=${id}`, '/api/admin-session']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, `${path}: expected authorization rejection`);
  }
  const event = await fetch(base + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: id, type: 'login' }) });
  assert.equal(event.status, 401);
  console.log('HTTP smoke passed: public page + 8 anonymous API rejections; no external database/provider access.');
} finally {
  server.kill('SIGTERM');
  await exited;
}
