import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "pulse_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const PLACEHOLDER_SECRET = "change-me-to-a-long-random-string";
const MIN_SECRET_LENGTH = 32;

export function isWeakSecret(value: string | undefined): boolean {
  return !value || value.length < MIN_SECRET_LENGTH || value === PLACEHOLDER_SECRET;
}

/** Refuse to run in production with a missing, short or placeholder secret (it would let anyone forge host logins). */
export function assertAuthSecret() {
  if (isWeakSecret(process.env.AUTH_SECRET)) {
    throw new Error(
      `AUTH_SECRET must be a random string of at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    );
  }
}

function secret() {
  if (process.env.NODE_ENV === "production") assertAuthSecret();
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-secret-change-me");
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
