# Too-Yen API

Recipe-sharing REST API — publish recipes, browse a feed, engage (like / favorite / comment), search, and manage master data.

**Stack:** [Bun](https://bun.sh) · [ElysiaJS](https://elysiajs.com) · [Drizzle ORM](https://orm.drizzle.team) · PostgreSQL ([Supabase](https://supabase.com))

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- A PostgreSQL database (Supabase project) — connection string for `DATABASE_URL`

## Getting started

```bash
bun install
cp .env.example .env      # then fill in the values below
bun run dev               # http://localhost:3000
```

Open **http://localhost:3000/swagger** for interactive API docs.

### Environment (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase **session pooler** connection string (port 5432) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — server-side only, never the anon key ([ADR-010](doc/adr/ADR-010-supabase-deployment.md)) |
| `JWT_SECRET` | Secret for signing access tokens |
| `PORT` | Optional, defaults to `3000` |

## Scripts

```bash
bun run dev          # hot-reload dev server
bun start            # run once (no watch)
bun run typecheck    # tsc --noEmit (strict)
bun test             # run tests
bun test -t "<name>" # run a single test by name
bun run db:check     # smoke query against the DB (needs DATABASE_URL)
```

Schema is managed in code with Drizzle Kit ([ADR-010 amendment](doc/adr/ADR-010-supabase-deployment.md#amendment-2026-07-10-schema-migrations--seeding-via-code)):

```bash
# edit src/db/schema/, then:
bun run db:generate   # write a SQL migration to ./drizzle (review it!)
bun run db:migrate    # apply migrations to DATABASE_URL
bun run db:seed       # seed reference data (idempotent)
bun run db:studio     # browse the DB
```

> ⚠️ **The production DB is already deployed (17 tables).** Applying a freshly generated *initial* migration to it will fail (it tries to `CREATE TABLE` on existing tables). **Baseline** the deployed DB first — mark the initial migration as already applied in Drizzle's `__drizzle_migrations` journal — then subsequent changes migrate incrementally. Confirm the baseline steps against the Drizzle Kit docs before touching prod. `db:push` is for throwaway/branch DBs only.

## Project structure

```text
src/
├── modules/           # feature modules (Controller → Service → Repository → DTO)
│   └── masters/       # reference implementation — copy its shape for new modules
├── db/
│   ├── schema/        # Drizzle schema, one file per table (barrel: index.ts)
│   ├── index.ts       # db client + Db/Tx/Executor types
│   ├── migrate.ts     # migration runner
│   └── seed.ts        # reference-data seed
├── shared/            # cross-module code (utils/errors.ts, services/, plugins/)
├── config/            # environment.ts
├── plugins.ts         # global plugins (CORS, Swagger)
└── index.ts           # entry point: error mapping + /healthz + /api/v1 modules
```

See **[DESIGN_PATTERN.md](DESIGN_PATTERN.md)** for the layered architecture with code examples, and **[CLAUDE.md](CLAUDE.md)** for a working-in-this-repo overview.

## API

- Base path: `/api/v1` · JWT Bearer auth on all endpoints except the Auth module
- Responses: `{ data, pagination }` for lists; errors as `{ "error": { "code", "message" } }`
- Full spec per module in **[doc/api/](doc/api/README.md)** (Auth, Profile, Recipes, Engagement, Search, Admin Master)

Architectural decisions are recorded as ADRs in **[doc/adr/](doc/adr/)**; the DB definition lives in [doc/data-dictionary-en.md](doc/data-dictionary-en.md) and [doc/supabase/](doc/supabase/).

## Testing

Tests run with `bun test` and drive the app in-process via `app.handle(...)` (no port opened). A preload (`bunfig.toml` → `tests/setup.ts`) supplies a dummy `DATABASE_URL` so the import graph loads without a real `.env`; postgres.js connects lazily, so no database is touched unless a test issues a query.
