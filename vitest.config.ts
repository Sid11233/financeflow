import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Deliberately separate from vite.config.ts rather than merged into it —
// the app's own vite.config.ts pulls in @vitejs/plugin-react and the
// Sentry plugin, neither of which the test runner needs, and a `test`
// block bolted onto the app config would ship two different concerns from
// one file. Both share the same @ alias for import consistency.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: process.env.CI ? ['dot', 'github-actions'] : ['default'],
  },
});
