function isHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'heic' || extension === 'heif';
}

async function browserCanDecodeHeic(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
    return true;
  } catch {
    return false;
  }
}

// Only converts when the browser actually can't decode the file itself —
// Safari can preview HEIC natively, so this is a no-op there. Chrome/
// Firefox generally can't, so this falls back to a JS-based decoder,
// loaded lazily since most uploads on most browsers never need it.
export async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  if (await browserCanDecodeHeic(file)) return file;

  const heic2any = (await import('heic2any')).default;
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([blob], newName, { type: 'image/jpeg' });
}
