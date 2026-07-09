# Module 4: Engagement (Like / Favorite / Comment)

References: home-menu.md M2/M3, post-detail.md | Auth: Bearer | Owners may engage with their own posts (ADR-008)

## Like

- **PUT /recipes/{id}/like** — like (idempotent) → `200 { "liked": true, "like_count": 46 }` | DB trigger updates the post owner's tier automatically (ADR-012)
- **DELETE /recipes/{id}/like** — unlike → `200 { "liked": false, "like_count": 45 }`

## Favorite

- **PUT /recipes/{id}/favorite** → `200 { "favorited": true, "favorite_count": 13 }` — appears in the saved list immediately
- **DELETE /recipes/{id}/favorite** → `200 { "favorited": false, "favorite_count": 12 }`

## Comments

### GET /recipes/{id}/comments?page=&limit=

Ordered latest first (AC M2-5); always filters `is_deleted = false` (ADR-008)

```json
{ "data": [ {
    "comment_id": 7, "comment_text": "Looks delicious",
    "image_url": "https://.../comment-images/7/img.jpg",
    "author": { "user_id": 2, "display_name": "Aor", "tier_name": "Bronze" },
    "is_mine": false, "created_at": "...", "updated_at": null
  } ], "pagination": { } }
```

### POST /recipes/{id}/comments

`multipart/form-data`: `comment_text`*, `image` (file, optional — one image, ADR-009)
Response `201`: comment object
Errors: `400 VALIDATION_ERROR` (empty text — AC M2-3)

### PATCH /comments/{comment_id}

Comment owner only (ADR-008) — `multipart`: `comment_text`, `image` (replaces existing), `remove_image=true`
Response `200` (updated_at is set)

### DELETE /comments/{comment_id}

Soft delete by the comment owner only — post owners cannot delete others' comments (ADR-008)
Response `204` | Errors: `403 FORBIDDEN`
