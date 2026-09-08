import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';

// Sits inside AuthGuard (so `profile` is already resolved by the time this
// renders) — gates is_staff-only routes like /admin/metrics. A non-staff
// user is redirected rather than shown a "forbidden" page: the flag isn't
// a customer-facing permission they could reasonably expect to request,
// so there's nothing useful to explain to them here.
export function StaffGuard({ children }: { children: ReactNode }) {
  const { profile } = useAuth();

  if (!profile?.is_staff) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
