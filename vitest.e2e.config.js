import { defineConfig } from 'vitest/config';

/**
 * Test end-to-end di browser sungguhan (Brave/Chrome).
 * Server dev dinyalakan sendiri oleh test/e2e.setup.js.
 */
export default defineConfig({
  test: {
    include: ['test/e2e.test.js'],
    globalSetup: ['./test/e2e.setup.js'],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    // Test browser berat; jalankan berurutan supaya tidak saling berebut
    // CPU dan tidak mengunduh beberapa window Brave sekaligus.
    fileParallelism: false,
  },
});