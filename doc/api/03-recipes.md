# Module 3: Recipes

References: home-menu.md, create-new-recipe.md, post-detail.md | Auth: Bearer

> **Implementation decisions (2026-07-10):**
> - **Bearer on every route** (including the feed) — per doc/api/README.md; no anonymous browsing.
> - **Integrity guard:** mutations on a *published* recipe must not break the publish checklist — `PATCH` that empties a required set, or deleting the cover image, returns `400 INCOMPLETE_RECIPE` with `details[]`. To gut a post, switch it to `private` first.
> - **/publish is draft-only** — re-publishing a `private` post goes through `PATCH /visibility` (which re-validates completeness); publishing an already-published post → `400 INVALID_STATUS`.
> - Replacing `steps` preserves existing step images by `step_number`; images of removed steps are deleted from storage.
> - **Upload compression:** media images → WebP 1600px, step images → WebP 1280px; videos → 720p H.264 via the bundled ffmpeg (`ffmpeg-static`, no host install — see doc/api/README.md). Caps: image ≤ 5 MB, video ≤ 50 MB → `400 FILE_TOO_LARGE`.

## GET /recipes — Home feed

Query: `sort=newest|most_liked|most_favorited` (default newest — AC 6/7), `page`, `limit`
Published posts only.

Response `200` (recipe card):

```json
{ "data": [ {
    "recipe_id": 10, "recipe_name": "Tom Yum Goong",
    "cover_image_url": "https://.../recipe-media/10/cover.jpg",
    "author": { "user_id": 1, "display_name": "Sak", "tier_name": "Silver" },
    "like_count": 45, "favorite_count": 12, "comment_count": 3,
    "liked_by_me": true, "favorited_by_me": false,
    "is_owner": false, "status": "published",
    "published_at": "2026-07-09T08:00:00Z"
  } ], "pagination": { } }
```

## GET /recipes/{id} — Post detail

draft/private: owner only (`403 FORBIDDEN`)

Response `200`: card fields above, plus:

```json
{ "description": "...", "cook_time_minutes": 30, "servings": 4,
  "skill_level": { "id": 1, "name": "Beginner" },
  "cooking_methods": [ { "id": 2, "name": "Boil" }, { "id": 5, "name": "Grill" } ],
  "category": { "id": 3, "name": "Thai" },
  "equipment": [ { "id": 1, "name": "Pot" } ],
  "ingredients": [ { "ingredient_id": 5, "name": "Shrimp", "amount": 300, "unit": { "id": 2, "name": "gram" }, "sort_order": 1 } ],
  "steps": [ { "step_number": 1, "instruction": "Boil the water...", "image_url": "..." } ],
  "media": [ { "media_id": 1, "type": "image", "url": "...", "is_cover": true, "sort_order": 0 },
             { "media_id": 2, "type": "video", "url": "...", "is_cover": false } ] }
```

## POST /recipes — Create (single shot)

> **[Changed 2026-07-10 — BREAKING]** now `multipart/form-data` (the JSON body is rejected with a hint). Everything — fields, cover, step images, publish — goes in ONE request.

Form fields:

| Field | Type | Meaning |
|-------|------|---------|
| `data` | JSON string | the recipe fields (same shape as the old JSON body below); omit for an empty draft |
| `cover` | image file | optional — becomes the cover (compressed per the media rules) |
| `video` | video file | optional — attaches the recipe's single video (one per recipe; on PATCH it replaces the existing one, deleting the old file) |
| `<image_field>` | image file | optional — each step's image is its own file part; name the part freely and reference that name in the step's `image_field` (e.g. `data.steps[0].image_field: "s1"` + a form part `s1`). The referenced part must exist and be an image, and the name must not be a reserved field (`data`/`cover`/`video`/`publish`) → else `400` |
| `publish` | `true` | optional — validate the AC M2-1 checklist and publish immediately (`400 INCOMPLETE_RECIPE` with `details[]` when incomplete); omitted = draft (AC M1-5: partial fields allowed) |

`data` shape:

```json
{ "recipe_name": "Tom Yum Goong", "description": "...", "cook_time_minutes": 30, "servings": 4,
  "skill_level_id": 1, "cooking_method_ids": [2, 5], "category_id": 3,
  "equipment": [ { "equipment_id": 4 }, { "name": "Air fryer" } ],
  "ingredients": [
    { "ingredient_id": 5, "amount": 300, "unit_id": 2 },
    { "name": "Galangal", "amount": 2, "unit_name": "slice" }
  ],
  "steps": [ { "step_number": 1, "instruction": "...", "image_field": "s1" } ] }
```

- `equipment[]` / `ingredients[]` — id-first for the dropdown UI (decision 2026-07-15). Each entry: send the `*_id` (picked from the master dropdown) **or** a `name` (a new free-text name → find-or-created into the master, case-insensitive dedupe). At least one is required; if both are sent the id wins. A not-found id → `400 VALIDATION_ERROR`; a soft-deleted id is reactivated and used (ADR-003).
  - **equipment**: `equipment_id` or `name`.
  - **ingredient**: `ingredient_id` or `name` (ADR-001).
  - **unit** (inside an ingredient): same `unit_id` / `unit_name` rule (ADR-007), but fully optional — omit both for no unit.
- `cooking_method_ids[]` — one or more master cooking-method ids (2026-07-17; was the single `cooking_method_id`). Replace-set semantics like equipment; ids only (no free-text create). A not-found id → `400 VALIDATION_ERROR`; a soft-deleted id is reactivated (ADR-003). At least one is required at publish.
- `description` is optional and no longer gated at publish (2026-07-17).
- **All-or-nothing:** if any image upload fails or the `publish` validation fails, the whole creation is rolled back (recipe + already-uploaded files) and the error is returned

Response `201`: recipe detail (status = draft, or published when `publish=true`)

## PATCH /recipes/{id}

Edit a draft or own post — `multipart/form-data`, same fields as POST **except `publish`** (rejected — use `/publish`). `data` sends only changed fields; `ingredients`/`steps`/`equipment` replace the whole set. `cover` replaces the cover; a step's `image_field` naming a form file part sets/replaces that step's image (the step must exist in the final step set).
Note: `data` commits first — if an image upload fails afterwards, the field changes stand and the image can be retried via `PUT /recipes/{id}/steps/{n}/image`.
Errors: `403 FORBIDDEN` (not the owner)

## POST /recipes/{id}/publish

Validates completeness per AC M2-1: recipe_name, skill_level, cooking_method ≥ 1, cook_time_minutes, category, equipment ≥ 1, ingredient ≥ 1, step ≥ 1, cover image (description is optional, not checked)
Response `200`: recipe detail (status = published, published_at set)
Errors: `400 INCOMPLETE_RECIPE` — `details` lists missing fields (AC M2-2)

## PATCH /recipes/{id}/visibility

```json
{ "status": "private" }
```

`private` ↔ `published` only (AC M3) | Response `200`

## DELETE /recipes/{id}

Hard delete + cascade (comments/likes/favorites/saved — AC M3-7); backend also deletes storage files (ADR-009)
Response `204`

## Media

- **POST /recipes/{id}/media** — `multipart`: `file`*, `type=image|video`, `is_cover`, `sort_order` | second video → `409 VIDEO_LIMIT`; a new `is_cover=true` unsets the previous cover
- **DELETE /recipes/{id}/media/{media_id}** — `204` (also deletes the file in the bucket)
- **PUT /recipes/{id}/steps/{step_number}/image** — `multipart`: `file`* (one image per step, replaces existing)
