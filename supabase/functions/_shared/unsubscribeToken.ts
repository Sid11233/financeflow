// HMAC-signed token proving a digest-unsubscribe link really was the one
// FinanceFlow sent to this specific user. This is a low-stakes,
// self-service action (turn off my own digest) reachable with no
// session, so a signed opaque token is enough — unlike request_tokens
// (which grants document upload access and needs storage, expiry, and
// revocation), there's nothing here worth a database row for.
const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' };

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), ALGORITHM, false, ['sign', 'verify']);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function signUnsubscribeToken(userId: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(ALGORITHM, key, new TextEncoder().encode(userId));
  return `${userId}.${toHex(signature)}`;
}

// Returns the user id the token was signed for, or null if the token is
// malformed or doesn't match what we'd have signed for that user id.
export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  const separatorIndex = token.indexOf('.');
  if (separatorIndex === -1) return null;

  const userId = token.slice(0, separatorIndex);
  const expected = await signUnsubscribeToken(userId, secret);
  return expected === token ? userId : null;
}
