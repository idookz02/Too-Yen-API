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
{ "description": "...", "cook_time_minutes": 30,
  "skill_level": { "id": 1, "name": "Beginner" },
  "cooking_method": { "id": 2, "name": "Boil" },
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
| `step_image_{n}` | image file | optional — image for `step_number` n in `data.steps` (n must exist there → else `400`) |
| `publish` | `true` | optional — validate the AC M2-1 checklist and publish immediately (`400 INCOMPLETE_RECIPE` with `details[]` when incomplete); omitted = draft (AC M1-5: partial fields allowed) |

`data` shape:

```json
{ "recipe_name": "Tom Yum Goong", "description": "...", "cook_time_minutes": 30,
  "skill_level_id": 1, "cooking_method_id": 2, "category_id": 3,
  "equipment_ids": [1, 4],
  "ingredients": [ { "name": "Shrimp", "amount": 300, "unit_name": "gram" } ],
  "steps": [ { "step_number": 1, "instruction": "..." } ] }
```

- `ingredients[].name` / `unit_name`: backend find-or-creates rows in `ingredient`/`unit` (case-insensitive dedupe, ADR-001/007)
- **All-or-nothing:** if any image upload fails or the `publish` validation fails, the whole creation is rolled back (recipe + already-uploaded files) and the error is returned

Response `201`: recipe detail (status = draft, or published when `publish=true`)

## PATCH /recipes/{id}

Edit a draft or own post — `multipart/form-data`, same fields as POST **except `publish`** (rejected — use `/publish`). `data` sends only changed fields; `ingredients`/`steps`/`equipment_ids` replace the whole set. `cover` replaces the cover; `step_image_{n}` sets/replaces that step's image (n must exist in the final step set).
Note: `data` commits first — if an image upload fails afterwards, the field changes stand and the image can be retried via `PUT /recipes/{id}/steps/{n}/image`.
Errors: `403 FORBIDDEN` (not the owner)

## POST /recipes/{id}/publish

Validates completeness per AC M2-1: recipe_name, description, skill_level, cooking_method, cook_time_minutes, category, equipment ≥ 1, ingredient ≥ 1, step ≥ 1, cover image
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
