# Module 5: Search

References: home-menu.md M5, advanced-search.md | Auth: Bearer | Searches published posts only

> **Implementation decisions (2026-07-10):** `equipment_ids` = **ANY** of the listed equipment (ingredients stay ALL per ADR-001); `GET /search/recent` returns the **10 latest** keywords; `q` is trimmed before matching/saving (blank q is not saved); `DELETE /search/recent/{keyword}` is idempotent (204 even if absent); autocomplete `limit` defaults to 10, max 20.

## GET /search/recipes

Keyword + advanced filters in a single endpoint — all filters combine with AND (AC 4)

Query params (all optional):

| Param | Example | Meaning |
|-------|---------|---------|
| q | `tom yum` | keyword against recipe name/description — automatically saved to recent searches |
| ingredient_ids | `5,8` | recipe must contain ALL listed ingredients (ADR-001) |
| max_cook_time | `30` | cook_time_minutes ≤ value (range filter, ADR-011) |
| equipment_ids | `1,4` | uses the listed equipment |
| skill_level_id | `1` | skill level |
| category_id | `3` | category |
| sort, page, limit | | same as feed |

Response `200`: paginated recipe cards (same shape as 03-recipes) — no matches returns `data: []` so the frontend shows the no-result message (AC 6)

## GET /search/match — pantry match (added 2026-07-10)

Rank published recipes by how much of each recipe the caller's items cover — "what can I cook with what I have". At least one of the two lists is required (`400 VALIDATION_ERROR` otherwise).

Query params: `ingredient_ids` (CSV), `equipment_ids` (CSV), `min_match` (0–100 floor on the overall pct), `page`, `limit`

- % per dimension = matched ÷ the **recipe's** total (a recipe needing 5 ingredients where you have 4 → 80%)
- `match_pct` = average of the provided dimensions; results need ≥ 1 matched item, sorted `match_pct` desc then newest

Response `200`: recipe cards (03-recipes shape) each extended with:

```json
{ "ingredient_match": { "matched": 4, "total": 5, "pct": 80 },
  "equipment_match": { "matched": 1, "total": 2, "pct": 50 },
  "match_pct": 65 }
```

`ingredient_match` / `equipment_match` is `null` when that list wasn't provided.

## Recent searches (AC M5-2/3/4)

- **GET /search/recent** → `200 { "keywords": [ { "keyword": "tom yum", "searched_at": "..." } ] }` — latest first
- **DELETE /search/recent/{keyword}** → `204` — removes one keyword

## Autocomplete (form inputs + filters)

- **GET /ingredients?q=shr&limit=10** → `200 { "data": [ { "ingredient_id": 5, "name": "Shrimp" } ] }`
- **GET /units?q=tb&limit=10** → `200 { "data": [ { "unit_id": 2, "name": "tbsp" } ] }`
