// Minimal toast store: a plain module-level array + pub/sub, read via
// useSyncExternalStore. No dependency needed for something this small, and
// it keeps the "no third-party UI kit" rule intact.

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant: 'success' | 'error';
  action?: ToastAction;
}

export interface ToastOptions {
  durationMs?: number;
  action?: ToastAction;
}

let toasts: Toast[] = [];
const listeners = new Set<() => void>();

const DISMISS_AFTER_MS = 4000;

function emit() {
  listeners.forEach((listener) => listener());
}

function addToast(message: string, variant: Toast['variant'], options?: ToastOptions) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, message, variant, action: options?.action }];
  emit();
  setTimeout(() => removeToast(id), options?.durationMs ?? DISMISS_AFTER_MS);
  return id;
}

export function removeToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToastsSnapshot() {
  return toasts;
}

export const toast = {
  success: (message: string, options?: ToastOptions) => addToast(message, 'success', options),
  error: (message: string, options?: ToastOptions) => addToast(message, 'error', options),
};
