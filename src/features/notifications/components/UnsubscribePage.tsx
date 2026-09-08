import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui';
import { unsubscribeFromDigest } from '../api/unsubscribeApi';

type Status = 'pending' | 'done' | 'error';

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    unsubscribeFromDigest(token)
      .then(() => setStatus('done'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardContent className="space-y-2 py-10">
          {status === 'pending' && <p className="text-sm text-neutral-500">Unsubscribing…</p>}
          {status === 'done' && (
            <>
              <h1 className="text-lg font-semibold text-neutral-900">You're unsubscribed</h1>
              <p className="text-sm text-neutral-500">
                You won't receive the FinanceFlow email digest anymore. You can turn it back on anytime from
                Settings.
              </p>
            </>
          )}
          {status === 'error' && (
            <>
              <h1 className="text-lg font-semibold text-neutral-900">Invalid link</h1>
              <p className="text-sm text-neutral-500">This unsubscribe link is invalid or malformed.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
