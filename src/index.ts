/**
 * Entry point — DESIGN_PATTERN.md §5.
 * 1. Global plugins  2. Module controllers (added per vibe-coding-plan steps)
 */
import { Elysia } from "elysia";
import { globalPlugins } from "./plugins";
import { env } from "./config/environment";

export const app = new Elysia()
  .use(globalPlugins)
  .get("/healthz", () => ({ ok: true }), {
    detail: { summary: "Health check" },
  });

// Listen only when run directly (not when imported by tests)
if (import.meta.main) {
  app.listen(env.PORT);
  console.log(
    `🦊 Too-Yen API running at ${app.server?.hostname}:${app.server?.port}`,
  );
}
