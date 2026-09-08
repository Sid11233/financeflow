export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'text/csv',
  'application/csv',
];

const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'xlsx', 'xls', 'csv'];

export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.xlsx,.xls,.csv,application/pdf,image/*';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type)) return true;
  // Some mobile browsers report an empty or generic MIME type for HEIC —
  // fall back to the extension rather than rejecting a genuinely fine file.
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(extension ?? '');
}

export function validateFile(file: File): string | null {
  if (!isAcceptedFile(file)) return 'This file type is not supported.';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'This file is too large. The maximum size is 25MB.';
  return null;
}
