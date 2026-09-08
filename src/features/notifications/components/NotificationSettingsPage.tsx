import { Card, CardContent, CardHeader, CardTitle, Field, Select } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useUpdateDigestFrequency } from '../hooks/useUpdateDigestFrequency';
import type { DigestFrequency } from '../api/digestApi';

const OPTIONS: { value: DigestFrequency; label: string; description: string }[] = [
  { value: 'daily', label: 'Daily', description: 'One email each morning summarizing what needs attention.' },
  { value: 'weekly', label: 'Weekly', description: 'One email every Monday morning.' },
  { value: 'off', label: 'Off', description: "Don't send me a digest email." },
];

export function NotificationSettingsPage() {
  const { profile } = useAuth();
  const updateMutation = useUpdateDigestFrequency(profile?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Email digest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-500">
            A summary of your overdue and waiting-on-client requests. Urgent alerts — a bounced email or a failed
            classification — are always sent immediately regardless of this setting.
          </p>
          <Field label="Frequency" htmlFor="digest-frequency">
            <Select
              id="digest-frequency"
              value={profile?.digest_frequency ?? 'daily'}
              disabled={!profile || updateMutation.isPending}
              onChange={(event) => updateMutation.mutate(event.target.value as DigestFrequency)}
              className="max-w-xs"
            >
              {OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-neutral-400">
            {OPTIONS.find((option) => option.value === (profile?.digest_frequency ?? 'daily'))?.description}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
