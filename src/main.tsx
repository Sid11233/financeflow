import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initSentry, SentryErrorBoundary } from '@/lib/sentry';
import './index.css';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SentryErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center p-6 text-center">
          <div>
            <p className="text-lg font-semibold text-neutral-900">Something went wrong.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Please refresh the page. If this keeps happening, contact support.
            </p>
          </div>
        </div>
      }
    >
      <App />
    </SentryErrorBoundary>
  </StrictMode>,
);
