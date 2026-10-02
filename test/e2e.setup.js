/**
 * Menyalakan server Vite sendiri untuk test browser, lalu Goodreads saat selesai.
 * Test e2e tidak bergantung pada `npm run dev` yang sedang berjalan.
 */

import { spawn } from 'node:child_process';
import { setTimeout as tunggu } from 'node:timers/promises';

export const E2E_PORT = 5199;
export const E2E_BASE = `http://localhost:${E2E_PORT}/`;

let anak;

async function siap(base) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      // server belum siap
    }
    await tunggu(500);
  }
  return false;
}

export async function setup() {
  anak = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--port', String(E2E_PORT), '--strictPort'],
    { stdio: 'ignore', detached: false }
  );

  const ok = await siap(E2E_BASE);
  if (!ok) {
    anak?.kill();
    throw new Error(`Server Vite untuk test e2e tidak siap di ${E2E_BASE}`);
  }
  process.env.E2E_BASE = E2E_BASE;
}

export async function teardown() {
  anak?.kill('SIGTERM');
  await tunggu(300);
  if (anak && !anak.killed) anak.kill('SIGKILL');
}