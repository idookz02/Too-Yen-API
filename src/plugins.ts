/**
 * Global plugins shared across the whole app (CORS, Swagger) — DESIGN_PATTERN.md §4.
 * Per-controller / cross-cutting plugins (auth, etc.) live under src/shared/plugins/.
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
        tags: [
          {
            name: "Master",
            description: "Public master-data dropdowns (Module 6)",
          },
        ],
      },
    }),
  );
