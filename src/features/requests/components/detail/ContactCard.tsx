import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { toast } from '@/lib/toast';

export function ContactCard({ email, phone }: { email: string | null; phone: string | null }) {
  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email copied.');
    } catch {
      toast.error(`Could not copy automatically — here it is: ${email}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-neutral-400">Email</p>
            <p className="truncate text-sm text-neutral-900">{email ?? '—'}</p>
          </div>
          {email && (
            <Button variant="outline" size="sm" onClick={copyEmail}>
              Copy email
            </Button>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Phone</p>
          <p className="text-sm text-neutral-900">{phone ?? '—'}</p>
        </div>
      </CardContent>
    </Card>
  );
}
