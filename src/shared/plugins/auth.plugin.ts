/**
 * JWT + auth guards (implementation-plan Phase 1).
 * - jwtPlugin: access tokens — sub = user_id (string), role claim, TTL env JWT_EXPIRES_IN (24h)
 * - resetJwtPlugin: 10-minute password-reset tokens (doc/api/01-auth.md note)
 * - authPlugin: verifies the Bearer token and resolves ctx.currentUser (401 UNAUTHENTICATED)
 * - requireAdmin: call inside handlers of admin-only routes (403 FORBIDDEN)
 */
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { env } from "../../config/environment";
import { forbidden, unauthorized } from "../utils/errors";

export type JwtPayload = { sub: string; role: string };
export type CurrentUser = { userId: number; role: string };

export const RESET_TOKEN_PURPOSE = "password_reset";
export type ResetJwtPayload = { sub: string; purpose: string };

export const jwtPlugin = new Elysia({ name: "too-yen/jwt" }).use(
  jwt({ name: "jwt", secret: env.JWT_SECRET, exp: env.JWT_EXPIRES_IN }),
);

export const resetJwtPlugin = new Elysia({ name: "too-yen/reset-jwt" }).use(
  jwt({ name: "resetJwt", secret: env.JWT_SECRET, exp: "10m" }),
);

/** Attach to a controller to require a valid Bearer token on all its routes. */
export const authPlugin = new Elysia({ name: "too-yen/auth" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ headers, jwt }) => {
    const header = headers["authorization"];
    if (!header?.toLowerCase().startsWith("bearer ")) {
      throw unauthorized("Missing Authorization Bearer token", "UNAUTHENTICATED");
    }
    const payload = await jwt.verify(header.slice(7).trim());
    if (!payload || typeof payload.sub !== "string") {
      throw unauthorized("Invalid or expired token", "UNAUTHENTICATED");
    }
    const currentUser: CurrentUser = {
      userId: Number(payload.sub),
      role: String((payload as JwtPayload & Record<string, unknown>).role ?? "user"),
    };
    return { currentUser };
  });

/** Guard for admin-only routes — use inside handlers behind authPlugin. */
export function requireAdmin(user: CurrentUser): void {
  if (user.role !== "admin") throw forbidden("Admin only", "FORBIDDEN");
}
