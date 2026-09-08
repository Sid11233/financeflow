import { useState } from 'react';
import { Button } from '@/components/ui';
import { notifyExpiredLink } from '../api/portalApi';

export function InvalidLinkState({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function handleNotify() {
    setStatus('sending');
    try {
      await notifyExpiredLink(token);
    } catch {
      // Best-effort from the client's point of view too — show the same
      // reassuring confirmation either way rather than a dead end; the
      // endpoint itself always tries regardless of what it finds.
    }
    setStatus('sent');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">This link is no longer active</h1>
      <p className="max-w-xs text-sm text-neutral-500">
        It may have expired or already been used. Let your accountant know and they can send you a fresh one.
      </p>
      {status === 'sent' ? (
        <p className="text-sm font-medium text-emerald-600">We&apos;ve let them know — check your email soon.</p>
      ) : (
        <Button onClick={handleNotify} disabled={status === 'sending'} className="min-h-[44px]">
          {status === 'sending' ? 'Sending…' : 'Request a new link'}
        </Button>
      )}
    </div>
  );
}
