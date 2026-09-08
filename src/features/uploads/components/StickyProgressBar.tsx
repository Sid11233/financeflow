import { ProgressBar } from '@/components/ui';

export function StickyProgressBar({ receivedCount, totalCount }: { receivedCount: number; totalCount: number }) {
  const percent = totalCount > 0 ? Math.round((receivedCount / totalCount) * 100) : 0;

  return (
    <div className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
      <p className="mb-1.5 text-sm font-medium text-neutral-700">
        {receivedCount} of {totalCount} document{totalCount === 1 ? '' : 's'} received
      </p>
      <ProgressBar value={percent} />
    </div>
  );
}
