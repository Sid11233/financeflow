import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AppLayout } from './AppLayout';
import { PortalLayout } from './PortalLayout';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { SignupPage } from '@/features/auth/components/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/components/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/components/ResetPasswordPage';
import { AcceptInvitePage } from '@/features/auth/components/AcceptInvitePage';
import { DashboardPage } from '@/features/dashboard/components/DashboardPage';
import { ClientsListPage } from '@/features/clients/components/ClientsListPage';
import { ClientFormDialog } from '@/features/clients/components/ClientFormDialog';
import { ClientDetailPage } from '@/features/clients/components/ClientDetailPage';
import { ImportClientsPage } from '@/features/clients/components/import/ImportClientsPage';
import { RequestsPage } from '@/features/requests/components/RequestsPage';
import { RequestDetailPage } from '@/features/requests/components/RequestDetailPage';
import { BulkRequestPage } from '@/features/requests/components/BulkRequestPage';
import { TeamSettingsPage } from '@/features/team/components/TeamSettingsPage';
import { NotificationSettingsPage } from '@/features/notifications/components/NotificationSettingsPage';
import { UnsubscribePage } from '@/features/notifications/components/UnsubscribePage';
import { MetricsDashboardPage } from '@/features/analytics/components/MetricsDashboardPage';
import { StaffGuard } from './StaffGuard';
import { OrganizationActivityPage } from '@/features/activity/components/OrganizationActivityPage';
import { UploadPortalPage } from '@/features/uploads/components/UploadPortalPage';
import { EmailPreviewPage } from '@/features/dev/components/EmailPreviewPage';

export const router = createBrowserRouter([
  // Public portal tree — no auth, no sidebar, isolated from the app tree.
  {
    path: '/upload/:token',
    element: <PortalLayout />,
    children: [{ index: true, element: <UploadPortalPage /> }],
  },

  // Reached from the digest email's unsubscribe link — same public,
  // no-sidebar, no-auth tree as the upload portal above.
  {
    path: '/unsubscribe',
    element: <PortalLayout />,
    children: [{ index: true, element: <UnsubscribePage /> }],
  },

  // Dev-only email template preview — never built into a production
  // bundle. Renders through the real send-email function in dryRun mode
  // (see emailPreviewApi.ts), so what's shown here is exactly what would
  // be sent, not a separate re-implementation that could drift from it.
  ...(import.meta.env.DEV ? [{ path: '/dev/emails', element: <EmailPreviewPage /> }] : []),

  // Public auth-adjacent routes — must live outside AuthGuard to avoid a
  // redirect loop (or, for /reset-password, because their session is a
  // short-lived recovery session rather than a normal logged-in one).
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/accept-invite/:token', element: <AcceptInvitePage /> },

  // Authenticated app tree — guarded, persistent sidebar layout.
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      // /clients/new and /clients/:id/edit render as children so
      // ClientFormDialog can overlay the still-visible list via its own
      // <Outlet/>, rather than replacing the page — that's what makes it a
      // "dialog" rather than a full navigation away from the table.
      {
        path: 'clients',
        element: <ClientsListPage />,
        children: [
          { path: 'new', element: <ClientFormDialog mode="create" /> },
          { path: ':id/edit', element: <ClientFormDialog mode="edit" /> },
        ],
      },
      { path: 'clients/import', element: <ImportClientsPage /> },
      { path: 'clients/:id', element: <ClientDetailPage /> },
      { path: 'requests', element: <RequestsPage /> },
      { path: 'requests/new-bulk', element: <BulkRequestPage /> },
      { path: 'requests/:id', element: <RequestDetailPage /> },
      { path: 'activity', element: <OrganizationActivityPage /> },
      { path: 'settings/team', element: <TeamSettingsPage /> },
      { path: 'settings/notifications', element: <NotificationSettingsPage /> },
      {
        path: 'admin/metrics',
        element: (
          <StaffGuard>
            <MetricsDashboardPage />
          </StaffGuard>
        ),
      },
    ],
  },
]);
