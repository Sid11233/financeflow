import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton, Switch } from '@/components/ui';
import { useRequestReminders } from '../../hooks/useRequestReminders';
import { useSetReminderSkipped, useSetRemindersPaused } from '../../hooks/useRequestActions';
import type { ReminderRow } from '../../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ReminderTimeline({ requestId, remindersPausedAt }: { requestId: string; remindersPausedAt: string | null }) {
  const remindersQuery = useRequestReminders(requestId);
  const setSkipped = useSetReminderSkipped(requestId);
  const setPaused = useSetRemindersPaused(requestId);

  const reminders = remindersQuery.data ?? [];
  const sent = reminders.filter((reminder) => reminder.sent_at);
  const next = reminders
    .filter((reminder) => !reminder.sent_at)
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0] as ReminderRow | undefined;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Reminders</CardTitle>
        <Switch
          checked={Boolean(remindersPausedAt)}
          onChange={(checked) => setPaused.mutate(checked)}
          disabled={setPaused.isPending}
          label="Pause automatic"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {remindersQuery.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            {next && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2">
                <div>
                  <p className="text-sm text-neutral-900">Next reminder</p>
                  <p className="text-xs text-neutral-500">
                    {formatDateTime(next.scheduled_for)}
                    {next.skipped_at && ' · Skipped'}
                  </p>
                </div>
                <Switch
                  checked={Boolean(next.skipped_at)}
                  onChange={(checked) => setSkipped.mutate({ reminderId: next.id, skipped: checked })}
                  disabled={setSkipped.isPending}
                  label="Skip"
                />
              </div>
            )}

            <ul className="space-y-2">
              {sent.length === 0 && <p className="text-sm text-neutral-400">No reminders sent yet.</p>}
              {sent
                .slice()
                .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
                .map((reminder) => (
                  <li key={reminder.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-neutral-700">{formatDateTime(reminder.sent_at!)}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="neutral">{reminder.channel}</Badge>
                      <Badge variant={reminder.type === 'manual' ? 'accent' : 'neutral'}>
                        {reminder.type === 'manual' ? 'Manual' : 'Scheduled'}
                      </Badge>
                    </div>
                  </li>
                ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
