import { Outlet } from 'react-router-dom';

/**
 * Standalone layout for the public portal (e.g. /upload/:token). Deliberately
 * has no sidebar, no auth awareness, and no dependency on the authenticated
 * app tree — it must work for anonymous, unauthenticated visitors.
 *
 * Just a background — no centering/max-width here. The upload page is a
 * tall, scrollable experience with its own sticky header and a bar fixed to
 * the viewport bottom; those need an unconstrained ancestor, so each portal
 * page manages its own width/padding instead.
 */
export function PortalLayout() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <Outlet />
    </div>
  );
}
