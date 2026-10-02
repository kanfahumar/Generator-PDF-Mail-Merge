import { defineConfig } from 'vitest/config';

/**
 * Test unit/integrasi (Node + happy-dom). Cepat, tidak butuh browser.
 * Test browser sungguhan ada di test/e2e.test.js dan dijalankan terpisah
 * lewat `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    exclude: ['test/e2e.test.js', 'node_modules/**', 'dist/**'],
  },
});