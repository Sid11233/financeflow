// Sample data for every template send-email can render, used only by the
// /dev/emails preview page (never mounted in production — see router.tsx).
// Kept in sync by hand with each template's Variables interface in
// supabase/functions/_shared/emails/templates/*.tsx; there's no shared
// import between the two (one is Deno-only, the other Vite/browser-only).
export interface EmailPreviewSample {
  template: string;
  label: string;
  variables: Record<string, unknown>;
}

const SAMPLE_DOCUMENTS = [
  { label: 'Bank Statement', isOptional: false },
  { label: 'Sales Invoices', isOptional: false },
  { label: 'Purchase Invoices', isOptional: false },
  { label: 'Payroll Report', isOptional: false },
  { label: 'Credit Card Statement', isOptional: true },
];

const SAMPLE_MISSING = ['Bank Statement', 'Purchase Invoices'];

export const EMAIL_PREVIEW_SAMPLES: EmailPreviewSample[] = [
  {
    template: 'request_initial',
    label: '1. Request initial',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      deadline: '2026-10-15',
      documents: SAMPLE_DOCUMENTS,
      uploadUrl: 'https://financeflow.app/upload/8sK3jQvY2pXn',
    },
  },
  {
    template: 'reminder_nudge',
    label: '2. Reminder — nudge',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      deadline: '2026-10-15',
      missingDocuments: SAMPLE_MISSING,
      uploadedCount: 3,
      totalCount: 5,
      uploadUrl: 'https://financeflow.app/upload/8sK3jQvY2pXn',
    },
  },
  {
    template: 'reminder_firm',
    label: '3. Reminder — firm',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      deadline: '2026-10-15',
      missingDocuments: SAMPLE_MISSING,
      uploadedCount: 3,
      totalCount: 5,
      uploadUrl: 'https://financeflow.app/upload/8sK3jQvY2pXn',
    },
  },
  {
    template: 'reminder_final',
    label: '4. Reminder — final',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      deadline: '2026-09-15',
      missingDocuments: SAMPLE_MISSING,
      uploadedCount: 3,
      totalCount: 5,
      uploadUrl: 'https://financeflow.app/upload/8sK3jQvY2pXn',
    },
  },
  {
    template: 'client_submitted',
    label: '5. Client submitted (to accountant)',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      requestUrl: 'https://financeflow.app/requests/1234',
    },
  },
  {
    template: 'accountant_overdue',
    label: '6. Accountant overdue notice',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      deadline: '2026-09-15',
      missingDocuments: SAMPLE_MISSING,
      requestUrl: 'https://financeflow.app/requests/1234',
    },
  },
  {
    template: 'accountant_digest',
    label: '7. Accountant digest',
    variables: {
      cadence: 'daily',
      overdue: [
        {
          clientName: 'Harbor Yoga Studio',
          periodLabel: 'September 2026',
          deadline: '2026-09-15',
          requestUrl: 'https://financeflow.app/requests/1234',
        },
      ],
      waiting: [
        {
          clientName: 'Maple & Co. Bakery',
          periodLabel: 'September 2026',
          deadline: '2026-10-15',
          requestUrl: 'https://financeflow.app/requests/5678',
        },
        {
          clientName: 'Ironwood Contracting LLC',
          periodLabel: 'September 2026',
          deadline: '2026-10-20',
          requestUrl: 'https://financeflow.app/requests/9012',
        },
      ],
      dashboardUrl: 'https://financeflow.app/dashboard',
      unsubscribeUrl: 'https://financeflow.app/unsubscribe?token=sample',
    },
  },
  {
    template: 'team_invite',
    label: '8. Team invite',
    variables: {
      inviterName: 'Alex Rivera',
      acceptUrl: 'https://financeflow.app/accept-invite/8sK3jQvY2pXn',
      expiresInDays: 7,
    },
  },
  {
    template: 'link_expired_request',
    label: '9. Link expired (to accountant)',
    variables: {
      clientName: 'Harbor Yoga Studio',
      periodLabel: 'September 2026',
      requestUrl: 'https://financeflow.app/requests/1234',
    },
  },
  {
    template: 'custom_message',
    label: '10. Custom message (reject & ask for new copy)',
    variables: {
      subject: 'We need a new copy of your Bank Statement',
      body: "Hi,\n\nThe file you uploaded for Bank Statement (statement.pdf) didn't quite work for us — could you upload a new copy when you get a chance?\n\nThanks!",
    },
  },
  {
    template: 'reminder_batch',
    label: '11. Reminder — batched (multiple requests)',
    variables: {
      clientName: 'Harbor Yoga Studio',
      items: [
        {
          periodLabel: 'August 2026',
          missingDocuments: ['Bank Statement'],
          uploadUrl: 'https://financeflow.app/upload/8sK3jQvY2pXn',
        },
        {
          periodLabel: 'September 2026',
          missingDocuments: SAMPLE_MISSING,
          uploadUrl: 'https://financeflow.app/upload/9tL4kRwZ3qYo',
        },
      ],
    },
  },
  {
    template: 'confirm_signup',
    label: '12. Confirm signup email',
    variables: {
      confirmUrl: 'https://financeflow.app/auth/confirm?token=sample',
    },
  },
];
