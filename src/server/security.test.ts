import { afterEach, describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";
import { isWeakSecret } from "./auth";
import { isAllowedOrigin, resolveClientIp } from "./network";
import { hit, isLimited, resetRateLimits } from "./rateLimit";

afterEach(() => {
  resetRateLimits();
  delete process.env.ALLOWED_ORIGINS;
  delete process.env.TRUST_PROXY;
});

describe("CSV formula injection", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx"])("neutralises %j", (v) => {
    expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("leaves normal text alone", () => expect(csvCell("What's next?")).toBe("What's next?"));
  it("still escapes after neutralising", () => expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`));
});

describe("isAllowedOrigin", () => {
  it("allows same host and non-browser clients", () => {
    expect(isAllowedOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isAllowedOrigin(undefined, "localhost:3000")).toBe(true);
  });
  it("rejects other sites and other ports", () => {
    expect(isAllowedOrigin("https://evil.example", "pulse.example")).toBe(false);
    expect(isAllowedOrigin("http://localhost:4000", "localhost:3000")).toBe(false);
    expect(isAllowedOrigin("null", "localhost:3000")).toBe(false);
  });
  it("uses ALLOWED_ORIGINS when set", () => {
    process.env.ALLOWED_ORIGINS = "https://pulse.example.com/";
    expect(isAllowedOrigin("https://pulse.example.com", "internal:3000")).toBe(true);
    expect(isAllowedOrigin("https://other.example.com", "other.example.com")).toBe(false);
  });
});

describe("resolveClientIp", () => {
  it("ignores X-Forwarded-For unless TRUST_PROXY is on", () => {
    expect(resolveClientIp("10.0.0.1", "1.2.3.4")).toBe("10.0.0.1");
    process.env.TRUST_PROXY = "true";
    expect(resolveClientIp("10.0.0.1", "1.2.3.4, 10.0.0.9")).toBe("1.2.3.4");
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const t = 1_000_000;
    expect([1, 2, 3].map(() => hit("k", 2, 1000, t))).toEqual([true, true, false]);
    expect(isLimited("k", 2, 1000, t + 10)).toBe(true);
    expect(hit("k", 2, 1000, t + 1001)).toBe(true);
  });
});

describe("isWeakSecret", () => {
  it("rejects missing, short and placeholder secrets", () => {
    expect(isWeakSecret(undefined)).toBe(true);
    expect(isWeakSecret("short")).toBe(true);
    expect(isWeakSecret("change-me-to-a-long-random-string")).toBe(true);
    expect(isWeakSecret("a".repeat(64))).toBe(false);
  });
});
