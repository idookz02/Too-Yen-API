# Too-Yen API Spec — Overview

Base URL: `/api/v1` | References: data-dictionary-en.md, ADR-001–012 | 2026-07-09

## Modules

| # | Module | File | Covers |
|---|--------|------|--------|
| 1 | Auth | [01-auth.md](01-auth.md) | sign-up, login, forgot password |
| 2 | Profile | [02-profile.md](02-profile.md) | view/edit profile, avatar, saved, drafts |
| 3 | Recipes | [03-recipes.md](03-recipes.md) | feed, CRUD, draft/publish/visibility, media |
| 4 | Engagement | [04-engagement.md](04-engagement.md) | like, favorite, comment |
| 5 | Search | [05-search.md](05-search.md) | keyword, advanced, recent, autocomplete |
| 6 | Admin Master | [06-admin-master.md](06-admin-master.md) | 4 master data types + tiers |

## Conventions

- **Auth**: JWT Bearer — `Authorization: Bearer <access_token>` on every endpoint except the Auth module; admin-only endpoints are marked `Auth: admin`
- **Content type**: `application/json`, except file uploads which use `multipart/form-data`
- **Pagination**: `?page=1&limit=20` (default limit 20, max 100) — responses are wrapped as:

```json
{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 153, "total_pages": 8 } }
```

- **Error envelope** (all errors):

```json
{ "error": { "code": "RECIPE_NOT_FOUND", "message": "Recipe not found" } }
```

- HTTP status: 200 OK, 201 created, 204 deleted/no body, 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict/duplicate
- **Timestamps**: ISO 8601 UTC (`2026-07-09T08:00:00Z`)
- **Media**: responses return a full `url` (backend builds it from bucket + object_path per ADR-009); uploads go through the backend only (service_role key, ADR-010)
- **Upload compression (2026-07-10)**: images are resized server-side (avatar 512px, recipe media 1600px, step/comment 1280px long edge, no upscale) and stored as **WebP q80**; videos are transcoded server-side to **720p H.264** with the ffmpeg binary bundled via `ffmpeg-static` (no host install, nothing delegated to the client; env `FFMPEG_PATH` only overrides it). Corrupt/undecodable videos are stored as-is. Input caps before compression: image ≤ 5 MB, video ≤ 50 MB → `400 FILE_TOO_LARGE`
- **Visibility rules**: draft/private posts are visible to the owner only; hard delete removes all engagement (ADR-005)
