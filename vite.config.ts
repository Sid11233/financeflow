import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

// Source map upload only runs when SENTRY_AUTH_TOKEN is present (set as a
// GitHub Actions secret — see .github/workflows/deploy-staging.yml and
// deploy-production.yml). A local `npm run build` with no token present
// still produces a working build; it just skips the upload, so this never
// blocks local development.
const sentryEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  plugins: [
    react(),
    sentryEnabled &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: process.env.VITE_SENTRY_RELEASE },
      }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Required for the Sentry plugin to actually have something to
    // upload — readable stack traces for minified production errors.
    sourcemap: true,
  },
});
