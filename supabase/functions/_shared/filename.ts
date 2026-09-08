const MAX_FILENAME_LENGTH = 100;

// Beyond path separators (stripped separately below) and control
// characters, these are the characters that cause real problems inside a
// storage path / URL segment. Deliberately not a blanket "strip everything
// non-alphanumeric" — that would mangle legitimate accented filenames
// (e.g. "Relevé bancaire.pdf") for no benefit once separators and control
// characters are already gone.
const UNSAFE_PATH_CHARS = /[/\\?#%:*"<>|&]+/g;

export function sanitizeFilename(rawFilename: string): string {
  const base = rawFilename.split(/[/\\]/).pop() || 'file';

  // Canonical form so visually-identical filenames (e.g. combining vs.
  // precomposed accents) don't produce different byte sequences once
  // stored.
  const normalized = base.normalize('NFKC');

  // Control characters (C0 range + DEL) have no legitimate place in a
  // filename and can cause problems in some storage/CDN layers.
  const withoutControlChars = normalized.replace(/[\x00-\x1F\x7F]/g, '');

  const withoutUnsafeChars = withoutControlChars.replace(UNSAFE_PATH_CHARS, '_');

  const trimmed = withoutUnsafeChars.trim().replace(/^[._]+/, '') || 'file';

  return truncatePreservingExtension(trimmed, MAX_FILENAME_LENGTH);
}

function truncatePreservingExtension(filename: string, maxLength: number): string {
  if (filename.length <= maxLength) return filename;

  const lastDot = filename.lastIndexOf('.');
  // Only treat it as a real extension if it's short and not a leading dot
  // (a leading dot is a hidden-file convention, not an extension).
  const hasExtension = lastDot > 0 && filename.length - lastDot <= 11;

  if (!hasExtension) return filename.slice(0, maxLength);

  const extension = filename.slice(lastDot);
  const nameWithoutExtension = filename.slice(0, lastDot);
  const availableForName = Math.max(1, maxLength - extension.length);

  return `${nameWithoutExtension.slice(0, availableForName)}${extension}`;
}
