// cf-connecting-ip first: Supabase's Edge Functions sit behind Cloudflare,
// which sets this from the real TCP connection and strips any
// client-supplied value of the same name before it ever reaches this code
// — unlike x-forwarded-for, it cannot be spoofed by the caller. Confirmed
// empirically: a request sent with a forged x-forwarded-for arrives here
// with that header already overwritten to the real chain (Supabase's own
// gateway does this too), so falling back to it is a second, still-safe
// layer for any request path that somehow doesn't carry cf-connecting-ip,
// not a "trust the client" gap.
export function getClientIp(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp;
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
