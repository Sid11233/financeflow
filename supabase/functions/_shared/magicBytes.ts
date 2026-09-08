export type ClaimedFileType = 'pdf' | 'jpeg' | 'png' | 'heic' | 'xlsx' | 'xls' | 'csv';

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function detectClaimedType(mimeType: string, filename: string): ClaimedFileType | null {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const mime = mimeType.toLowerCase();

  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (['image/jpeg', 'image/jpg'].includes(mime) || ['jpg', 'jpeg'].includes(extension)) return 'jpeg';
  if (mime === 'image/png' || extension === 'png') return 'png';
  if (['image/heic', 'image/heif'].includes(mime) || ['heic', 'heif'].includes(extension)) return 'heic';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || extension === 'xlsx') {
    return 'xlsx';
  }
  if (mime === 'application/vnd.ms-excel' || extension === 'xls') return 'xls';
  if (['text/csv', 'application/csv'].includes(mime) || extension === 'csv') return 'csv';
  return null;
}

// Verifies the first bytes of a file against the signature for its claimed
// type. Only ever called against a small sample (the first 512 bytes) —
// see fetchObjectSample in portal-confirm-upload — never the whole file.
export function checkMagicBytes(bytes: Uint8Array, claimedType: ClaimedFileType): boolean {
  switch (claimedType) {
    case 'pdf':
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case 'jpeg':
      // JFIF and Exif JPEGs both start with the SOI + APPn marker sequence.
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'png':
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'xlsx':
      // xlsx is a zip archive: PK + one of the standard local/central/
      // spanned archive markers.
      return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2]);
    case 'xls':
      // Legacy .xls is an OLE Compound File.
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'heic': {
      if (bytes.length < 12) return false;
      if (bytesToAscii(bytes.slice(4, 8)) !== 'ftyp') return false;
      return HEIC_BRANDS.includes(bytesToAscii(bytes.slice(8, 12)));
    }
    case 'csv':
      // Plain text has no magic number of its own — the only meaningful
      // check available is that it isn't secretly one of the binary
      // formats above wearing a .csv extension.
      return !isKnownBinaryFormat(bytes);
  }
}

function isKnownBinaryFormat(bytes: Uint8Array): boolean {
  return (
    checkMagicBytes(bytes, 'pdf') ||
    checkMagicBytes(bytes, 'jpeg') ||
    checkMagicBytes(bytes, 'png') ||
    checkMagicBytes(bytes, 'xlsx') ||
    checkMagicBytes(bytes, 'xls') ||
    checkMagicBytes(bytes, 'heic')
  );
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}
