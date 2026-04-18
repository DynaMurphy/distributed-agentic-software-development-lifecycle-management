import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";

/**
 * Simple in-memory rate limiter for guest user creation.
 * Limits each IP to a maximum number of guest sessions within a time window.
 */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5; // max 5 guest creations per IP per hour

const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

// Periodically clean up expired entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Known bot/crawler User-Agent patterns.
 * These should never trigger guest user creation.
 */
const BOT_UA_PATTERNS = [
  /bot\b/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /mediapartners/i,
  /lighthouse/i,
  /pingdom/i,
  /uptimerobot/i,
  /headless/i,
  /phantom/i,
  /wget/i,
  /curl/i,
  /python-requests/i,
  /go-http-client/i,
  /axios/i,
  /node-fetch/i,
  /scrapy/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /semrush/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /petalbot/i,
  /yandexbot/i,
  /baiduspider/i,
  /duckduckbot/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true; // No UA = likely not a real browser
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function getClientIp(request: Request): string {
  const headers = new Headers(request.headers);
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";
  const userAgent = request.headers.get("user-agent");
  const clientIp = getClientIp(request);

  // Block bots/crawlers from creating guest users
  if (isBot(userAgent)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Rate limit guest user creation per IP
  if (isRateLimited(clientIp)) {
    return new Response("Too many requests. Please try again later.", {
      status: 429,
    });
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    return await signIn("guest", { redirect: true, redirectTo: redirectUrl });
  } catch (error: unknown) {
    // Auth.js v5 throws NEXT_REDIRECT for successful sign-ins; re-throw so Next.js handles it
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof (error as any).digest === "string" &&
      (error as any).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    console.error("[guest-auth] signIn failed:", error);
    return new Response("Guest sign-in failed. Please try again later.", {
      status: 500,
    });
  }
}
