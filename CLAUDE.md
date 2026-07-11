# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Runtime is **Bun** (not Node). No build step — Bun runs TypeScript directly.

```bash
bun install              # install deps (node_modules is git-ignored)
bun run dev              # hot-reload server (src/index.ts)
bun start                # run once, no watch
bun run typecheck        # tsc --noEmit (strict) — run before declaring done
bun test                 # all tests
bun test tests/healthz.test.ts     # a single test file
bun test -t "returns { ok: true }" # a single test by name
bun run db:check         # smoke query against the real DB (needs DATABASE_URL)
bun run smoke            # full-endpoint smoke vs real DB+storage (needs .env + db:seed first)
bun run storage:cleanup  # storage orphan diff, dry-run (-- --apply to delete)
```

Schema is managed in code via Drizzle Kit: `db:generate` (write migration), `db:migrate` (apply), `db:push` (branch DBs only), `db:studio`, `db:seed`. See the **baseline note** below before running these against the deployed DB.

Requires a `.env` (copy `.env.example`): `DATABASE_URL` (Supabase **session pooler**, port 5432), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`.

## Architecture

**Stack:** Bun + ElysiaJS + Drizzle ORM + PostgreSQL (Supabase). See `DESIGN_PATTERN.md` for the layering guide with code.

**Feature modules (4 layers).** Each domain lives in `src/modules/<name>/` as Controller → Service → Repository → DTO:
- **Controller** (`<name>.controller.ts`): an `new Elysia({ prefix })`, defines routes + `params`/`body`/`query`/`response` validation, delegates to the service. Wired into the app in `src/index.ts`.
- **Service** (`services/`): business logic, HTTP-agnostic. Throws `AppError` (from `src/shared/utils/errors.ts` — `badRequest`/`unauthorized`/`notFound`/`conflict`, etc.); never sets HTTP status itself.
- **Repository** (`repositories/`): the **only** layer that imports `db`/`schema`. Methods take an optional `Executor` (`db` or a `tx`) so they work inside transactions.
- **DTO** (`dto/`): TypeBox (`t.Object`) schemas — do double duty as validation + Swagger.

`src/modules/masters/` is the reference implementation (`GET /master/{type}`); copy its shape for new modules.

**Central error mapping.** `src/index.ts` has one global `onError` (`as: "global"`, so it also covers the `/api/v1` child group) that emits the spec envelope `{ "error": { "code", "message" } }`: `AppError` → its status/code, `VALIDATION` → 400, `NOT_FOUND` → 404, else 500. Services rely on this — they throw, they don't format HTTP responses.

**Routing.** Ops endpoints stay at root (`/healthz`, Swagger at `/swagger`); all feature modules mount under a `/api/v1` child instance (e.g. `GET /api/v1/master/{type}`). Add new modules inside that group in `src/index.ts`.

**App export contract.** `src/index.ts` exports `app` and only calls `app.listen()` under `if (import.meta.main)`, so tests import `app` and call `app.handle(new Request(...))` without opening a port.

**Database schema is code-managed.** `src/db/schema/` has **one file per table** (17 tables) re-exported through `src/db/schema/index.ts` (the barrel drizzle-kit reads). It is the authoritative definition (ADR-010 amendment): schema changes flow code → `db:generate` → review SQL → `db:migrate`. `src/db/schema.ts` is a deprecated re-export kept so `import ... from "./schema"` still resolves. `src/db/index.ts` is the postgres.js + Drizzle client (service-role connection per ADR-010) and exports the `Db`/`Tx`/`Executor` types.

> ⚠️ **Baseline the deployed DB before migrating it.** Production already has the 17 tables, so applying a freshly generated *initial* migration would try to `CREATE` existing tables and fail. Baseline first — mark the initial migration as already applied in Drizzle's `__drizzle_migrations` journal — then changes migrate incrementally. `db:push` is for throwaway/branch DBs only. Nobody has run migrate/seed against prod yet; verify baseline steps against the Drizzle Kit docs first. See the [ADR-010 amendment](doc/adr/ADR-010-supabase-deployment.md#amendment-2026-07-10-schema-migrations--seeding-via-code).

**Config & tests without a full `.env`.** `src/config/environment.ts` uses **lazy getters**, so importing `env` doesn't validate vars you don't touch. The db client (`src/db/index.ts`) does read `DATABASE_URL` at import time; because feature modules pull it into the graph, `bunfig.toml` preloads `tests/setup.ts` which sets a dummy `DATABASE_URL` (postgres.js connects lazily, so no real DB is hit unless a test runs a query).

**Global vs scoped plugins.** `src/plugins.ts` holds app-wide plugins (CORS, Swagger, default docs at `/swagger`). Per-controller plugins (e.g. JWT/auth) belong in `src/shared/plugins/` so public routes don't pay for them.

## Spec vs. implementation

`doc/` is the **authoritative product spec**; the code is an early skeleton (currently only `/healthz` + the `masters` reference module at `/api/v1/master/{type}`). When building a feature, read the matching doc first — do not invent contracts:
- `doc/api/*.md` — the 6 modules (Auth, Profile, Recipes, Engagement, Search, Admin Master) with exact request/response shapes. `doc/api/README.md` has cross-cutting conventions: base path `/api/v1`, JWT Bearer on all but Auth, `?page&limit` pagination envelope, and the error envelope `{ "error": { "code", "message" } }`.
- `doc/adr/ADR-001..012` — binding decisions. Notably: **bigint `generatedAlwaysAsIdentity` IDs** (not UUIDs); `users.role` is text `'user'|'admin'`; master data soft-deletes via `is_active` and a name matching an inactive row **reactivates** it (ADR-003); recipe is a single table with a `status` check (ADR-005); engagement counts come from `COUNT`, not denormalized columns (ADR-008); media lives in Supabase Storage referenced by bucket + object_path (ADR-009); user tier is derived from total likes via a DB trigger (ADR-012).
- `doc/supabase/*.sql` + `doc/data-dictionary-en.md` — the real DB definition the Drizzle mirror must match.

The wiring is spec-aligned (nested error envelope, `/api/v1` prefix, `{ data, pagination }` responses); the remaining gap is simply the modules that aren't built yet. When adding one, follow its `doc/api/*.md` contract exactly.
