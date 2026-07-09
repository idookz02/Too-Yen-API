# Module 3: Recipes

References: home-menu.md, create-new-recipe.md, post-detail.md | Auth: Bearer

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

## POST /recipes — Create (draft)

Save Draft works with incomplete fields (AC M1-5) — send whatever is filled in.

```json
{ "recipe_name": "Tom Yum Goong", "description": "...", "cook_time_minutes": 30,
  "skill_level_id": 1, "cooking_method_id": 2, "category_id": 3,
  "equipment_ids": [1, 4],
  "ingredients": [ { "name": "Shrimp", "amount": 300, "unit_name": "gram" } ],
  "steps": [ { "step_number": 1, "instruction": "..." } ] }
```

- `ingredients[].name` / `unit_name`: backend find-or-creates rows in `ingredient`/`unit` (case-insensitive dedupe, ADR-001/007)

Response `201`: recipe detail (status = draft)

## PATCH /recipes/{id}

Edit a draft or own post — same body as POST (send only changed fields; `ingredients`/`steps`/`equipment_ids` replace the whole set)
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
