/**
 * Global plugins (CORS, Swagger) — DESIGN_PATTERN.md §4.
 * Cross-cutting plugins from implementation-plan Phase 1 (error.ts, auth.ts)
 * will live alongside this file in src/plugins/.
 */
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

export const globalPlugins = new Elysia({ name: "global-plugins" })
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Too-Yen API",
          version: "1.0.0",
          description:
            "Recipe sharing API — Bun + ElysiaJS + Drizzle on Supabase",
        },
      },
    }),
  );
