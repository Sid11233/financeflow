export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // x-correlation-id: lets a browser caller pass its own id through to be
  // echoed in every log line this request produces end to end (see
  // _shared/log.ts). x-request-id is accepted too for back-compat with
  // callers still sending the older header name.
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id',
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function jsonError(message: string, status: number, requestId?: string) {
  return jsonResponse({ error: message }, status, requestId ? { 'X-Request-Id': requestId } : {});
}
