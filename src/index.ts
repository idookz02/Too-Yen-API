/**
 * Entry point — DESIGN_PATTERN.md §5.
 * 1. Global plugins  2. Module controllers (added per vibe-coding-plan steps)
 */
import { Elysia } from "elysia";
import { globalPlugins } from "./plugins";
import { env } from "./config/environment";
import { AppError } from "./shared/utils/errors";
import { authController } from "./modules/auth/auth.controller";
import { mastersController } from "./modules/masters/masters.controller";
import { recipesController } from "./modules/recipes/recipes.controller";

export const app = new Elysia()
  // 1. Global plugins (CORS, Swagger)
  .use(globalPlugins)
  // 2. Centralised error mapping (doc/api/README.md envelope) — services throw
  //    AppError, Elysia maps the rest. `as: "global"` so it also covers the
  //    /api/v1 feature modules mounted as child instances below.
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.statusCode;
      return {
        error: {
          code: error.code ?? "ERROR",
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "Validation failed" } };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "Not found" } };
    }
    console.error(`[${code}]`, error);
    set.status = 500;
    return {
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    };
  })
  // 3. Health check (ops endpoint — stays at root, outside /api/v1)
  .get("/healthz", () => ({ ok: true }), {
    detail: { summary: "Health check" },
  })
  // 4. Feature modules — all mounted under /api/v1 (doc/api/README.md)
  .use(
    new Elysia({ prefix: "/api/v1", name: "api-v1" })
      .use(authController)
      .use(recipesController)
      .use(mastersController),
  );

// Listen only when run directly (not when imported by tests)
if (import.meta.main) {
  app.listen(env.PORT);
  console.log(
    `🦊 Too-Yen API running at ${app.server?.hostname}:${app.server?.port}`,
  );
}
