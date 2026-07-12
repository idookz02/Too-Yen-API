/**
 * Entry point — DESIGN_PATTERN.md §5.
 * 1. Global plugins  2. Module controllers (added per vibe-coding-plan steps)
 */
import { Elysia } from "elysia";
import { globalPlugins } from "./plugins";
import { env } from "./config/environment";
import { AppError } from "./shared/utils/errors";
import { adminMasterController } from "./modules/admin-master/admin-master.controller";
import { authController } from "./modules/auth/auth.controller";
import { engagementController } from "./modules/engagement/engagement.controller";
import { mastersController } from "./modules/masters/masters.controller";
import { profileController } from "./modules/profile/profile.controller";
import { recipesController } from "./modules/recipes/recipes.controller";
import { searchController } from "./modules/search/search.controller";

// request logging (Step 9) — silent under bun test (NODE_ENV=test)
const requestStart = new WeakMap<Request, number>();

export const app = new Elysia()
  // 1. Global plugins (CORS, Swagger)
  .use(globalPlugins)
  .onRequest(({ request }) => {
    requestStart.set(request, performance.now());
  })
  .onAfterResponse({ as: "global" }, ({ request, set }) => {
    if (process.env.NODE_ENV === "test") return;
    const started = requestStart.get(request);
    const ms = started !== undefined ? (performance.now() - started).toFixed(0) : "?";
    console.log(
      `${request.method} ${new URL(request.url).pathname} -> ${set.status ?? 200} (${ms}ms)`,
    );
  })
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
      if (process.env.DEBUG_VALIDATION) console.error("[VALIDATION]", String(error));
      return { error: { code: "VALIDATION_ERROR", message: "Validation failed" } };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "Not found" } };
    }
    // Elysia's t.File type sniffing (magic bytes) throws INVALID_FILE_TYPE —
    // a client sending a fake "image" is a 400, not a server error
    if ((error as { code?: string }).code === "INVALID_FILE_TYPE") {
      set.status = 400;
      return {
        error: { code: "VALIDATION_ERROR", message: (error as Error).message },
      };
    }
    if (process.env.NODE_ENV !== "test") console.error(`[${code}]`, error);
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
      .use(profileController)
      .use(recipesController)
      .use(engagementController)
      .use(searchController)
      .use(adminMasterController)
      .use(mastersController),
  );

// Listen only when run directly (not when imported by tests)
if (import.meta.main) {
  app.listen(env.PORT);
  console.log(
    `🦊 Too-Yen API running at ${app.server?.hostname}:${app.server?.port}`,
  );
}
