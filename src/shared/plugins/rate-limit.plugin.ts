/**
 * In-memory sliding-window rate limiter (Step 9 decision 2026-07-10:
 * hand-rolled, no extra dependency — sufficient for a single instance).
 * Attach per-controller: `.use(rateLimit({ name: "auth", max: 10 }))`.
 * Over the limit → 429 { error: { code: "RATE_LIMITED" } } via the global mapper.
 */
import { Elysia } from "elysia";
import { AppError } from "../utils/errors";

export type RateLimitOptions = {
  name: string;
  /** window size in ms (default 60s) */
  windowMs?: number;
  /** max requests per ip per window (default 10) */
  max?: number;
};

export function rateLimit({ name, windowMs = 60_000, max = 10 }: RateLimitOptions) {
  const hits = new Map<string, number[]>();

  return new Elysia({ name: `too-yen/rate-limit/${name}` }).onBeforeHandle(
    { as: "scoped" },
    ({ request, server }) => {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        server?.requestIP?.(request)?.address ||
        "local";

      const windowStart = Date.now() - windowMs;
      const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart);
      if (recent.length >= max) {
        hits.set(ip, recent);
        throw new AppError(429, "Too many requests — try again later", "RATE_LIMITED");
      }
      recent.push(Date.now());
      hits.set(ip, recent);

      // opportunistic prune so the map can't grow unbounded
      if (hits.size > 10_000) {
        for (const [key, times] of hits) {
          if (!times.some((t) => t > windowStart)) hits.delete(key);
        }
      }
    },
  );
}
