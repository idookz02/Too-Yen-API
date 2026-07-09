# Module 5: Search

References: home-menu.md M5, advanced-search.md | Auth: Bearer | Searches published posts only

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

## Recent searches (AC M5-2/3/4)

- **GET /search/recent** → `200 { "keywords": [ { "keyword": "tom yum", "searched_at": "..." } ] }` — latest first
- **DELETE /search/recent/{keyword}** → `204` — removes one keyword

## Autocomplete (form inputs + filters)

- **GET /ingredients?q=shr&limit=10** → `200 { "data": [ { "ingredient_id": 5, "name": "Shrimp" } ] }`
- **GET /units?q=tb&limit=10** → `200 { "data": [ { "unit_id": 2, "name": "tbsp" } ] }`
