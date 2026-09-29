/** Set by server.ts on every HTTP request so route handlers can see the caller's address. */
export const CLIENT_IP_HEADER = "x-pulse-client-ip";

/**
 * Only trust X-Forwarded-For when TRUST_PROXY=true (i.e. behind a reverse proxy you control);
 * otherwise clients could spoof it to dodge rate limits.
 */
export function resolveClientIp(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined): string {
  if (process.env.TRUST_PROXY === "true" && forwardedFor) {
    const first = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(",")[0]?.trim();
    if (first) return first;
  }
  return remoteAddress ?? "unknown";
}

/**
 * Browsers always send Origin on WebSocket/XHR handshakes. Reject cross-site ones so another site
 * can't ride a signed-in host's cookie. Requests with no Origin come from non-browser clients,
 * which can't carry a victim's cookies.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (allowed.length) return allowed.includes(origin.replace(/\/$/, ""));
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
