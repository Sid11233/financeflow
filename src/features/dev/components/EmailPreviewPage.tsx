import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { previewEmailTemplate } from '../api/emailPreviewApi';
import { EMAIL_PREVIEW_SAMPLES } from '../emailPreviewSamples';

export function EmailPreviewPage() {
  const { organization } = useAuth();
  const [selectedTemplate, setSelectedTemplate] = useState(EMAIL_PREVIEW_SAMPLES[0].template);
  const [view, setView] = useState<'html' | 'text'>('html');

  const sample = EMAIL_PREVIEW_SAMPLES.find((item) => item.template === selectedTemplate)!;

  const previewQuery = useQuery({
    queryKey: ['email-preview', selectedTemplate, organization?.id],
    queryFn: () => previewEmailTemplate(sample.template, organization!.id, sample.variables),
    enabled: Boolean(organization?.id),
  });

  return (
    <div className="flex h-screen bg-neutral-50">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-4">
        <div className="mb-4">
          <h1 className="text-base font-semibold text-neutral-900">Email previews</h1>
          <p className="text-xs text-neutral-400">Dev only — renders via send-email(dryRun), nothing is sent.</p>
        </div>
        <nav className="space-y-1">
          {EMAIL_PREVIEW_SAMPLES.map((item) => (
            <button
              key={item.template}
              type="button"
              onClick={() => setSelectedTemplate(item.template)}
              className={cn(
                'block w-full rounded-md px-3 py-2 text-left text-sm',
                item.template === selectedTemplate
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-neutral-600 hover:bg-neutral-100',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {!organization ? (
          <p className="text-sm text-neutral-500">Loading your organization…</p>
        ) : previewQuery.isPending ? (
          <Skeleton className="h-96 w-full max-w-2xl" />
        ) : previewQuery.isError ? (
          <p className="text-sm text-red-600">{(previewQuery.error as Error).message}</p>
        ) : (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-400">Subject</p>
                <p className="text-sm font-medium text-neutral-900">{previewQuery.data.subject}</p>
              </div>
              <div className="flex gap-1 rounded-md border border-neutral-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setView('html')}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium',
                    view === 'html' ? 'bg-accent text-accent-foreground' : 'text-neutral-600',
                  )}
                >
                  HTML
                </button>
                <button
                  type="button"
                  onClick={() => setView('text')}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium',
                    view === 'text' ? 'bg-accent text-accent-foreground' : 'text-neutral-600',
                  )}
                >
                  Plain text
                </button>
              </div>
            </div>

            {view === 'html' ? (
              <iframe
                title={`${sample.label} preview`}
                srcDoc={previewQuery.data.html}
                className="h-[75vh] w-full rounded-lg border border-neutral-200 bg-white"
              />
            ) : (
              <pre className="h-[75vh] w-full overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-800">
                {previewQuery.data.text}
              </pre>
            )}

            <Badge variant="neutral">{sample.template}</Badge>
          </div>
        )}
      </main>
    </div>
  );
}
