# Module 2: Profile

References: user-profile.md | Auth: Bearer

> **Implementation decisions (2026-07-10):** password policy = **min 8 chars** (same as signup) → `400 PASSWORD_POLICY_VIOLATION`; `GET /users/me/recipes` without `?status` returns **both** published + private; drafts sort by last edit, own posts by publish date.

## GET /users/me

Response `200`:

```json
{ "user_id": 1, "username": "sakkarin", "display_name": "Sak", "email": "a@b.com",
  "profile_picture_url": "https://.../avatars/1/avatar.jpg",
  "role": "user", "tier": { "tier_id": 2, "name": "Silver", "min_likes": 100 },
  "total_likes_received": 152, "created_at": "2026-07-09T08:00:00Z" }
```

## PATCH /users/me

Edit display name / password (username is immutable — AC 6)

```json
{ "display_name": "Sak V2", "password": "newSecret" }
```

Both fields optional | Response `200`: user object
Errors: `400 PASSWORD_POLICY_VIOLATION` (AC 4)

## PUT /users/me/avatar

`multipart/form-data`: `file`* — replaces the current picture (backend deletes the old file in the `avatars` bucket)
Response `200`: `{ "profile_picture_url": "..." }`

## GET /users/me/saved-recipes?page=&limit=

Favorited posts, ordered by save date, latest first (AC 5) — other users' private posts are filtered out (ADR-005)
Response `200`: paginated recipe cards (shape in 03-recipes)

## GET /users/me/drafts?page=&limit=

Own drafts | Response `200`: paginated recipe cards (status = draft)

## GET /users/me/recipes?status=published|private&page=&limit=

Own posts on the Profile page, including private posts hidden from the feed (create-recipe M3 ACs)
