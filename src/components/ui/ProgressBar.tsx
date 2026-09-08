import { cn } from '@/lib/utils';

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-neutral-100', className)}
    >
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
