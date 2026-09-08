import { Skeleton } from '@/components/ui';

export function LoadingSkeleton() {
  return (
    <div className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-6">
      <div className="flex flex-col items-center gap-3 py-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-14 w-full" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-32 w-full" />
      ))}
    </div>
  );
}
