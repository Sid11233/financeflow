import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';

const PROFILE_TIMEOUT_MS = 10_000;

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);
  const waitStartedAt = useRef<number | null>(null);

  const waitingOnProfile = Boolean(user) && !profile;

  useEffect(() => {
    if (!waitingOnProfile) {
      waitStartedAt.current = null;
      setTimedOut(false);
      return;
    }

    if (waitStartedAt.current === null) {
      waitStartedAt.current = Date.now();
    }

    const remaining = PROFILE_TIMEOUT_MS - (Date.now() - waitStartedAt.current);

    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }

    const timer = setTimeout(() => setTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [waitingOnProfile]);

  if (isLoading && !waitingOnProfile) {
    return <FullScreenMessage>Loading…</FullScreenMessage>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (waitingOnProfile) {
    if (timedOut) {
      return (
        <FullScreenMessage>
          <p className="text-sm font-medium text-neutral-900">This is taking longer than expected.</p>
          <p className="mt-1 max-w-xs text-sm text-neutral-500">
            Your account was created, but we couldn&apos;t finish setting up your workspace. Contact{' '}
            <a className="text-accent underline" href="mailto:support@financeflow.app">
              support@financeflow.app
            </a>{' '}
            for help.
          </p>
        </FullScreenMessage>
      );
    }

    return <FullScreenMessage>Setting up your workspace…</FullScreenMessage>;
  }

  return <>{children}</>;
}

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-1 px-4 text-center text-sm text-neutral-500">
      {children}
    </div>
  );
}
