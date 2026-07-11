# Module 6: Admin Master Data

References: admin-master-data.md, ADR-003/004/011/012 | Auth: **admin only** — other roles get `403 FORBIDDEN` (AC 1)

> **Implementation decisions (2026-07-10):** duplicate-name checks are **case-insensitive** (applies to both 409 and the ADR-003 reactivation match); `recalc_user_tier` runs after **every** tier mutation (create/update/delete — per implementation-plan, superset of the PATCH-only wording below); renaming onto an existing name (even inactive) → 409; unknown id → `404 ENTRY_NOT_FOUND`.

`{type}` = `skill-levels` | `cooking-methods` | `categories` | `equipment` | `tiers`

## GET /admin/master/{type}?include_inactive=false

Ordered by name A→Z (AC 12) — tiers are ordered by min_likes

```json
{ "data": [ { "id": 1, "name": "Beginner", "is_active": true, "in_use_count": 12, "created_at": "..." } ] }
```

`in_use_count` = number of recipes (or users, for tiers) referencing the entry — used for the delete warning (AC 7)

## POST /admin/master/{type}

```json
{ "name": "Expert" }
```

tiers add one field: `{ "name": "Gold", "min_likes": 500 }`
Response `201` | Errors: `409 DUPLICATE_ENTRY` (duplicate name within the same type — AC 5; for tiers a duplicate min_likes is also 409)

> A name matching an inactive entry reactivates it instead of creating a new row (ADR-003)

## PATCH /admin/master/{type}/{id}

```json
{ "name": "Advanced" }
```

Response `200` | tiers: `min_likes` is editable — the backend must run `recalc_user_tier` for all users afterwards (ADR-012)

## DELETE /admin/master/{type}/{id}

**Soft delete** — sets `is_active = false`; existing recipes keep their references (AC 10, ADR-003)
Response `204`

## GET /admin/master/types

Type list for rendering tabs → `200 { "types": ["skill-levels", "cooking-methods", "categories", "equipment", "tiers"] }`

> **User-facing dropdowns** (no admin required): `GET /master/{type}` — returns `is_active = true` entries only, used by the Create Recipe form / Advanced Search filters (AC 11)
