const COMPRESSION_THRESHOLD_BYTES = 3 * 1024 * 1024;
// Caps resolution rather than quality alone — 2400px on the long edge keeps
// document text legible while meaningfully shrinking typical phone-camera
// photos (often 4000px+).
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.82;

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= COMPRESSION_THRESHOLD_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.\w+$/, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // Compression is an optimization, not a requirement — if anything
    // about decoding fails, upload the original rather than blocking it.
    return file;
  }
}
