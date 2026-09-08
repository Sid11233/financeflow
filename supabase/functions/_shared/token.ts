// Base58 (Bitcoin alphabet): digits/letters minus 0, O, I, l — the
// "ambiguous characters" a human might mistype when copying a link by hand.
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function generatePortalToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base58Encode(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  let encoded = '';
  while (value > 0n) {
    const remainder = value % 58n;
    value /= 58n;
    encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
  }

  // Standard base58 convention: each leading zero byte becomes a leading
  // '1' (index 0), since a leading zero would otherwise vanish once the
  // byte array is treated as one big integer.
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = BASE58_ALPHABET[0] + encoded;
  }

  return encoded || BASE58_ALPHABET[0];
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Defense-in-depth alongside the indexed DB lookup used to actually find a
// token row: never short-circuits, so the comparison itself doesn't leak
// timing information about *where* two equal-length strings first differ.
// Both inputs here are always fixed-length (64-char) hex sha256 digests, so
// the length check below never itself varies based on secret content.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
