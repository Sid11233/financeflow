import { Button } from '@/components/ui';

export function NetworkErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Couldn&apos;t connect</h1>
      <p className="max-w-xs text-sm text-neutral-500">Check your internet connection and try again.</p>
      <Button onClick={onRetry} className="min-h-[44px]">
        Try again
      </Button>
    </div>
  );
}
