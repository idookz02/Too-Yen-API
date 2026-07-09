# Too-Yen API — Vibe Coding Plan

Copy-paste prompts for driving an AI coding agent (Claude Code / Cursor), one session per step, in order.
Stack: Bun + ElysiaJS + Drizzle → Supabase (project `too-yen`) | Based on: implementation-plan.md

## How to use

1. Start each session by attaching the **context files** listed for that step (from `doc/`)
2. Paste the prompt block as-is, then review the diff before moving on
3. Don't skip the **Done when** checklist — run it yourself
4. One step = one commit

## Global guardrails (paste at the top of EVERY session)

```text
Rules for this project:
- Runtime is Bun + ElysiaJS + Drizzle ORM + TypeScript. Do not introduce Express/Node-isms.
- The Supabase database is ALREADY deployed and is the source of truth. NEVER run drizzle-kit push/migrate against it. Schema changes are out of scope.
  [SUPERSEDED 2026-07-10 — ADR-010 amendment: schema is now code-managed; migrate/seed via Drizzle Kit are allowed (baseline the deployed DB first).]
- All DB access uses DATABASE_URL (service role). Never use the Supabase anon key.
- Secrets come from env vars only. Never hardcode keys or commit .env.
- Every error response uses { "error": { "code": "...", "message": "..." } } per doc/api/README.md.
- Every list endpoint uses page/limit pagination per doc/api/README.md.
- Write bun:test tests for the rules I list, and make `bun test` + `tsc --noEmit` pass before finishing.
```

---

## Step 0 — Scaffold

Context: `api/README.md`, `api/implementation-plan.md`

```text
Scaffold a Bun + ElysiaJS project called too-yen-api.
- Install: elysia, @elysiajs/jwt, @elysiajs/cors, @elysiajs/swagger, drizzle-orm, postgres, drizzle-kit, @supabase/supabase-js
- Create src/index.ts with an Elysia app, CORS, swagger plugin, and GET /healthz returning { ok: true }
- Create .env.example with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
- Set up the folder structure from doc/api/implementation-plan.md (src/db, src/plugins, src/lib, src/modules, tests)
- Add package scripts: dev, test, typecheck
```

Done when: `bun run dev` serves `/healthz` and `/swagger`

## Step 1 — Drizzle schema from the live DB

Context: `data-dictionary-en.md`, `supabase/001_schema.sql`, `supabase/003_user_tier.sql`

```text
Create src/db/schema.ts defining the EXISTING Supabase schema with drizzle-orm (pgTable) —
all 17 tables exactly as in doc/data-dictionary-en.md: users, master_skill_level,
master_cooking_method, master_category, master_equipment, master_tier, recipe, ingredient,
unit, recipe_ingredient, recipe_equipment, cooking_step, recipe_media, comment, recipe_like,
recipe_favorite, recent_search.
Match every column name, type, nullability, PK/FK/unique exactly (see the SQL files for truth).
Also create src/db/client.ts (postgres.js + drizzle init from DATABASE_URL).
Do NOT generate or run any migration.
[SUPERSEDED 2026-07-10 — ADR-010 amendment permits code migrations via Drizzle Kit. Also note: src/db/client.ts is now src/db/index.ts.]
```

Done when: `tsc --noEmit` passes; a scratch script can `select` from `users` against the real DB

## Step 2 — Foundations (error / auth / pagination / storage)

Context: `api/README.md`

```text
Build the cross-cutting pieces per doc/api/README.md conventions:
1. src/plugins/error.ts — AppError(code, httpStatus, message) class + Elysia onError mapping
   (including validation errors -> 400 VALIDATION_ERROR) to the error envelope.
2. src/plugins/auth.ts — @elysiajs/jwt setup (sub = user_id, role claim). Provide requireAuth
   (401 UNAUTHENTICATED) and requireAdmin (403 FORBIDDEN) and a currentUser derive.
3. src/lib/pagination.ts — parse page/limit (default 20, max 100), wrap { data, pagination }.
4. src/lib/storage.ts — supabase-js client (service role) with upload/remove/publicUrl for the
   3 public buckets: recipe-media, avatars, comment-images. Path conventions from
   doc/api/implementation-plan.md Phase 1.
5. src/lib/password.ts — Bun.password argon2id hash/verify.
Tests: error envelope shape, pagination clamping, JWT guard 401/403.
```

## Step 3 — Auth module

Context: `api/01-auth.md`

```text
Implement doc/api/01-auth.md exactly in src/modules/auth:
POST /auth/signup (multipart, optional profile_picture -> avatars bucket),
POST /auth/login, POST /auth/forgot-password/check (issue a 10-minute signed reset token),
POST /auth/forgot-password/reset.
Signup inserts the user and returns the tier the DB trigger assigned (re-read the row).
Duplicate email/username -> 409 DUPLICATE_ACCOUNT. Wrong login -> 401 INVALID_CREDENTIALS.
Tests: happy paths, duplicates, bad password, expired/invalid reset token.
```

## Step 4 — Recipe card query + Recipes module

Context: `api/03-recipes.md`, `data-dictionary-en.md`

```text
Implement doc/api/03-recipes.md in src/modules/recipes.
Start with a shared buildRecipeCard query (author + tier name, cover image url, like/favorite/
comment counts, liked_by_me / favorited_by_me for the current user) — used by feed, search,
profile lists.
Then: GET /recipes (published only, sort newest|most_liked|most_favorited),
GET /recipes/:id (full detail; draft/private -> owner only 403),
POST /recipes (draft, partial fields allowed; find-or-create ingredient/unit by lower(name)
in a transaction), PATCH /recipes/:id (replace-set for ingredients/steps/equipment_ids),
POST /recipes/:id/publish (validate the full checklist -> 400 INCOMPLETE_RECIPE with details[]),
PATCH /recipes/:id/visibility (published <-> private only),
DELETE /recipes/:id (collect all storage paths first, delete row, then remove files),
media endpoints (1 video max -> 409 VIDEO_LIMIT; new cover unsets old; step image PUT).
Tests: publish validation matrix, ownership guards, ingredient dedupe, media limits.
```

## Step 5 — Profile module

Context: `api/02-profile.md`

```text
Implement doc/api/02-profile.md in src/modules/profile:
GET /users/me (tier join + total_likes_received),
PATCH /users/me (display_name/password only),
PUT /users/me/avatar (upload new, delete old file),
GET /users/me/saved-recipes (favorite order desc, exclude others' private posts),
GET /users/me/drafts, GET /users/me/recipes?status=.
Reuse buildRecipeCard from the recipes module.
Tests: username immutability, saved list hides private posts of other users.
```

## Step 6 — Engagement module

Context: `api/04-engagement.md`

```text
Implement doc/api/04-engagement.md in src/modules/engagement:
PUT/DELETE /recipes/:id/like and /favorite (idempotent upsert / delete, return fresh counts —
tier updates happen via DB trigger, no app logic),
GET /recipes/:id/comments (is_deleted = false, latest first),
POST /recipes/:id/comments (multipart, optional single image -> comment-images bucket),
PATCH /comments/:id (owner only, set updated_at, image replace / remove_image),
DELETE /comments/:id (soft delete, owner only — post owner cannot delete others').
Tests: double-like idempotency, owner-only rules, soft-deleted comments never returned.
```

## Step 7 — Search module

Context: `api/05-search.md`

```text
Implement doc/api/05-search.md in src/modules/search:
GET /search/recipes — dynamic AND filters: q (ILIKE name/description), ingredient_ids
(recipe must contain ALL of them: group by + having count), max_cook_time, equipment_ids,
skill_level_id, category_id; published only; reuse buildRecipeCard; when q is present,
upsert recent_search (on conflict update searched_at).
GET /search/recent, DELETE /search/recent/:keyword.
GET /ingredients?q= and GET /units?q= (prefix ILIKE autocomplete, limit 10).
Tests: ALL-ingredients semantics, AND combination, recent-search dedupe.
```

## Step 8 — Admin master module

Context: `api/06-admin-master.md`

```text
Implement doc/api/06-admin-master.md in src/modules/admin-master behind requireAdmin:
a generic handler over a type->table map (skill-levels, cooking-methods, categories,
equipment, tiers). GET list (name asc, tiers by min_likes, in_use_count per entry,
include_inactive flag), POST (reactivate if an inactive entry has the same name; duplicates
-> 409 DUPLICATE_ENTRY), PATCH, DELETE (soft: is_active = false), GET /admin/master/types.
Tiers carry min_likes; after any tier change run: select recalc_user_tier(user_id) from users.
Also add the public GET /master/:type returning active entries only (no admin required).
Tests: 403 for non-admin, reactivation, soft delete keeps FK refs, tier recalc executes.
```

## Step 9 — Hardening + seed + smoke

Context: `api/implementation-plan.md` Phase 8

```text
Finish the service:
1. scripts/seed.ts — tiers (Bronze 0, Silver 100, Gold 500), starter master data
   (skill levels, cooking methods, categories, equipment), 2 demo users + 3 demo recipes.
2. scripts/storage-cleanup.ts — list storage objects per bucket, diff against DB paths
   (recipe_media, cooking_step.image_path, comment.image_path, users.profile_picture_path),
   delete orphans. Dry-run flag.
3. Rate limit auth routes; request logging.
4. Upload size limits: images <= 5 MB, video <= 50 MB (free tier friendly).
5. A smoke-test script hitting every endpoint per the specs and asserting status codes.
```

Done when: seed + smoke pass against the live Supabase project; `/swagger` shows all modules

---

## Suggested session order & checkpoints

| Session | Steps | Checkpoint before continuing |
|---------|-------|------------------------------|
| 1 | 0 + 1 | schema.ts matches data dictionary column-for-column |
| 2 | 2 + 3 | can signup/login against real DB, tier auto-assigned |
| 3 | 4 | feed + publish validation green |
| 4 | 5 + 6 | saved list + comment rules green |
| 5 | 7 + 8 | search AND semantics + admin guards green |
| 6 | 9 | seed + smoke on live project |
