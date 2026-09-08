import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'cursor-pointer p-4 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        isActive && 'border-accent ring-1 ring-accent',
      )}
    >
      <p className="text-2xl font-semibold text-neutral-900">{value}</p>
      <p className="text-sm text-neutral-500">{label}</p>
    </Card>
  );
}
