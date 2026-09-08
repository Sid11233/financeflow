import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useAuth } from '@/features/auth/hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/clients', label: 'Clients' },
  { to: '/requests', label: 'Requests' },
  { to: '/activity', label: 'Activity' },
  { to: '/settings/team', label: 'Team' },
  { to: '/settings/notifications', label: 'Settings' },
];

export function AppLayout() {
  const { profile } = useAuth();

  return (
    <div className="flex h-screen bg-neutral-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex items-center justify-between px-4 py-5">
          <span className="text-lg font-semibold text-neutral-900">FinanceFlow</span>
          <NotificationBell />
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          {profile?.is_staff && (
            <NavLink
              to="/admin/metrics"
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                )
              }
            >
              Pilot metrics
            </NavLink>
          )}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
