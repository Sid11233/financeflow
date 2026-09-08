import { useSyncExternalStore } from 'react';
import { getToastsSnapshot, removeToast, subscribeToasts } from '@/lib/toast';
import { cn } from '@/lib/utils';

export function ToastViewport() {
  const toasts = useSyncExternalStore(subscribeToasts, getToastsSnapshot);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm shadow-md',
            item.variant === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          <span className="flex-1">{item.message}</span>
          <div className="flex shrink-0 items-center gap-2">
            {item.action && (
              <button
                type="button"
                onClick={() => {
                  item.action!.onClick();
                  removeToast(item.id);
                }}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                {item.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="text-current opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
