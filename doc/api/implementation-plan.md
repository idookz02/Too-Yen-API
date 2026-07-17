# Too-Yen API — Implementation Plan

Stack: **Bun + ElysiaJS + Drizzle ORM** → Supabase Postgres (service_role, ADR-010) + Supabase Storage (ADR-009)
References: api/README.md (spec), data-dictionary-en.md, ADR-001–012 | 2026-07-09

## Guiding rules

- The API is the only thing that talks to the database — RLS is enabled with no policies, so every connection uses the service_role credentials kept in backend env only (ADR-010).
- DB is already deployed (17 tables + tier triggers). Drizzle schema must mirror it — introspect first, never let the ORM "sync" or auto-migrate against the live DB. Schema changes go through Supabase migrations, then re-introspect.
  [SUPERSEDED 2026-07-10 — ADR-010 amendment: the Drizzle schema in code is authoritative; schema changes flow code → db:generate → db:migrate (baseline the deployed DB first).]
- Business rules the DB does NOT enforce (app-enforced): publish completeness, 1 video / 1 cover per recipe, comment `is_deleted` filtering, visibility guards, tier recalc after editing `master_tier`.

## Suggested project structure

```
src/
  index.ts              # Elysia app, plugin registration
  db/
    schema.ts           # drizzle tables (from introspection)
    client.ts           # postgres.js + drizzle init
  plugins/
    auth.ts             # @elysiajs/jwt, currentUser derive, requireAdmin guard
    error.ts            # error envelope mapper { error: { code, message } }
  lib/
    pagination.ts       # page/limit parsing + response wrapper
    storage.ts          # Supabase Storage upload/delete, URL builder
    password.ts         # Bun.password (argon2id)
  modules/
    auth/    profile/    recipes/    engagement/    search/    admin-master/
      index.ts          # Elysia instance: routes + t.Object validation
      service.ts        # business logic, drizzle queries
tests/                  # bun:test per module
```

---

## Phase 0 — Project setup (0.5 day)

1. `bun create elysia too-yen-api`; add `drizzle-orm postgres @elysiajs/jwt @elysiajs/cors @supabase/supabase-js drizzle-kit`
2. Env: `DATABASE_URL` (Supabase **session pooler, port 5432**; use transaction pooler 6543 only if deploying serverless), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`
3. `drizzle-kit introspect` against the live DB → commit `schema.ts`; verify all 17 tables and FK relations appear
4. Health route `GET /healthz`; CI: `bun test` + `tsc --noEmit`

## Phase 1 — Cross-cutting foundations (1 day)

1. **Error plugin**: map thrown `AppError(code, status, message)` → spec envelope; catch Elysia validation errors → `400 VALIDATION_ERROR`
2. **Auth plugin**: JWT sign/verify (`sub` = user_id, `role`); `derive` resolves `currentUser`; `requireAuth` / `requireAdmin` guards (`401` / `403 FORBIDDEN`)
3. **Pagination helper**: clamp `limit` ≤ 100, build `{ data, pagination }` wrapper
4. **Storage service** (supabase-js with service key): `upload(bucket, path, file)`, `remove(bucket, paths[])`, `publicUrl(bucket, path)`; path convention `recipe-media/{recipe_id}/{uuid}.{ext}`, `avatars/{user_id}/…`, `comment-images/{comment_id}/…`
5. **Password**: `Bun.password.hash/verify` (argon2id)

## Phase 2 — Module 1: Auth (1 day)

- `POST /auth/signup`: multipart parse → uniqueness check (or catch unique violation → `409 DUPLICATE_ACCOUNT`) → hash → insert (DB trigger assigns base tier) → optional avatar upload → sign JWT
- `POST /auth/login`: verify → `401 INVALID_CREDENTIALS`
- Forgot password: `check` issues a short-lived (10 min) signed reset token; `reset` verifies + matches confirm → update hash
- Tests: duplicate email/username, wrong password, reset token expiry

## Phase 3 — Module 2: Profile (0.5 day)

- `GET /users/me` (join master_tier + total likes subquery), `PATCH /users/me` (display_name/password only — username immutable)
- `PUT /users/me/avatar`: upload new → update path → delete old file
- Saved / drafts / own-recipes lists reuse the recipe-card query from Phase 4 (build after or stub first)

## Phase 4 — Module 3: Recipes (2–3 days, the core)

1. **Card query** (shared): recipe + author(+tier) + cover image + like/favorite/comment counts + `liked_by_me`/`favorited_by_me` — one SQL with lateral/aggregate subqueries; index-backed sorts for newest / most_liked / most_favorited
2. **Feed** `GET /recipes`: status = published only
3. **Detail** `GET /recipes/{id}`: full joins (ingredients+units ordered by sort_order, steps, equipment, media); guard: draft/private → owner only
4. **Create/Update**: single transaction — upsert recipe row; find-or-create `ingredient`/`unit` by `lower(name)` (ADR-001/007); replace-set semantics for ingredients/steps/equipment/cooking_methods (multi cooking methods via `recipe_cooking_method` junction, ids only)
5. **Publish**: completeness validation (name, skill, method ≥1, cook_time, category, equipment ≥1, ingredient ≥1, step ≥1, cover; description optional) → `400 INCOMPLETE_RECIPE` with `details[]`
6. **Visibility** `PATCH /recipes/{id}/visibility`: published ↔ private only
7. **Delete**: collect storage paths (media + step images + comment images) → delete row (cascade) → remove files (ADR-009 cleanup); tier recalc fires via DB trigger
8. **Media endpoints**: enforce 1 video (`409 VIDEO_LIMIT`) and single cover in a transaction
- Tests: draft with empty fields, publish validation matrix, non-owner 403, cascade + file cleanup

## Phase 5 — Module 4: Engagement (1 day)

- Like/favorite: `PUT` = upsert (`on conflict do nothing`), `DELETE` = delete; return fresh counts. Tier updates happen in-DB (ADR-012) — no app logic
- Comments: list (filter `is_deleted = false`, latest first), create (multipart, optional image), edit (owner only, set `updated_at`, image replace/remove), soft delete (owner only)
- Tests: idempotent double-like, owner-only edit/delete, soft-deleted comments hidden

## Phase 6 — Module 5: Search (1 day)

- `GET /search/recipes`: dynamic where — `q` (ILIKE on name/description), `ingredient_ids` must ALL match (group by + having count), `max_cook_time` ≤, equipment/skill/category; AND combination (AC 4)
- `q` present → upsert `recent_search` (`on conflict (user_id, keyword) do update searched_at`)
- Recent list + delete-by-keyword; ingredient/unit autocomplete (`ILIKE prefix`, limit 10)
- Tests: multi-ingredient AND semantics, recent-search dedupe

## Phase 7 — Module 6: Admin Master (1 day)

- Generic handler over a type→table map (`skill-levels`, `cooking-methods`, `categories`, `equipment`, `tiers`); all routes behind `requireAdmin`
- List with `in_use_count` (per-type count query); create with reactivate-on-inactive-duplicate (ADR-003); duplicate → `409 DUPLICATE_ENTRY`
- Delete = soft (`is_active = false`)
- Tiers: extra `min_likes` field; after create/update/delete run `select recalc_user_tier(user_id) from users` (ADR-012)
- Public `GET /master/{type}`: active entries only
- Tests: non-admin 403, reactivation path, tier recalc effect

## Phase 8 — Hardening & deploy (1–2 days)

1. **Storage cleanup job**: scheduled task diffing `storage.objects` against DB paths → remove orphans (covers soft-deleted comment images, replaced avatars)
2. Rate limiting on auth endpoints; request logging; CORS for the web origin
3. Seed script: base tiers (`Bronze 0 / Silver 100 / Gold 500`), starter master data, demo users/recipes
4. OpenAPI: enable `@elysiajs/swagger` (Elysia generates it from `t.Object` schemas for free)
5. Deploy (any Bun host: Railway/Fly/VM); smoke test against spec; verify free-tier quotas (1 GB storage / 5 GB egress) with upload size limits (e.g. images ≤ 5 MB, video ≤ 50 MB)

---

## Timeline summary (1 dev)

| Phase | Scope | Est. |
|-------|-------|------|
| 0–1 | Setup + foundations | 1.5 d |
| 2–3 | Auth + Profile | 1.5 d |
| 4 | Recipes | 2–3 d |
| 5–6 | Engagement + Search | 2 d |
| 7 | Admin master | 1 d |
| 8 | Hardening + deploy | 1–2 d |
| **Total** | | **~9–11 days** |

## Definition of done

Every endpoint matches the module spec (shape, status codes, error codes); bun:test coverage on the rules listed per phase; no anon-key usage anywhere; storage files never orphaned after delete flows; OpenAPI served at `/swagger`.
