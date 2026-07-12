# Module 5: Search

References: home-menu.md M5, advanced-search.md | Auth: Bearer | Searches published posts only

> **Implementation decisions (2026-07-10):** `equipment_ids` = **ANY** of the listed equipment (ingredients stay ALL per ADR-001); `GET /search/recent` returns the **10 latest** keywords; `q` is trimmed before matching/saving (blank q is not saved); `DELETE /search/recent/{keyword}` is idempotent (204 even if absent); autocomplete `limit` defaults to 10, max 20.

## GET /search/recipes

Keyword + advanced filters in a single endpoint — all filters combine with AND (AC 4)

Query params (all optional):

| Param | Example | Meaning |
|-------|---------|---------|
| q | `tom yum` | keyword — automatically saved to recent searches. **[Expanded 2026-07-10]** matches recipe name, description, **ingredient names, author display name, category/cooking-method/equipment names, and step instructions** (ILIKE substring — FTS can't tokenize Thai). Multi-word: each whitespace-separated token must match somewhere (AND). When `sort` is omitted and `q` is present, results are **relevance-ranked** (name > ingredients > author > master names > description > steps); `sort=relevance` is also accepted explicitly |
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

## POST /search/by-image — photo search (added 2026-07-10)

One-shot: upload a food photo, get matching recipes. `multipart/form-data` with a single `image` file (compressed server-side before analysis). GPT-4o-mini identifies the dish + ingredients (Thai/English); the results feed the existing search:

- **dish recognized** → keyword search on the dish name, relevance-ranked → cards tagged `matched_by: "dish"`
- **detected ingredients that exist in our `ingredient` table** → pantry match → cards tagged `matched_by: "ingredients"`
- merged (keyword first, deduped), max 20

**Cards use the exact `/search/match` shape** (aligned 2026-07-10 so the UI reuses one component): every card carries `ingredient_match` and `equipment_match` (nullable) plus an overall `match_pct` — a dish-name hit has `ingredient_match: null` and `match_pct: 100`; an ingredient hit has `match_pct` equal to its ingredient pct. `equipment_match` is always `null` here (photos don't filter by equipment). `matched_by` is an additive extra.

```json
{ "analysis": {
    "dish_name": { "th": "ต้มยำกุ้ง", "en": "Tom Yum Goong" },
    "ingredients_detected": [ { "th": "กุ้ง", "en": "Shrimp" } ],
    "ingredients_matched": [ { "ingredient_id": 5, "name": "Shrimp" } ] },
  "data": [
    { "recipe_id": 10, "matched_by": "dish",
      "ingredient_match": null, "equipment_match": null, "match_pct": 100 },
    { "recipe_id": 12, "matched_by": "ingredients",
      "ingredient_match": { "matched": 1, "total": 4, "pct": 25 },
      "equipment_match": null, "match_pct": 25 } ] }
```

Ops notes: requires `OPENAI_API_KEY` (absent → `503 FEATURE_DISABLED`); upstream failure → `502 VISION_API_ERROR`; rate-limited **5/min per IP** (`RATE_LIMIT_IMAGE_SEARCH_MAX`) since every call has a real per-request cost.

## Recent searches (AC M5-2/3/4)

- **GET /search/recent** → `200 { "keywords": [ { "keyword": "tom yum", "searched_at": "..." } ] }` — latest first
- **DELETE /search/recent/{keyword}** → `204` — removes one keyword

## Autocomplete (form inputs + filters)

- **GET /ingredients?q=shr&limit=10** → `200 { "data": [ { "ingredient_id": 5, "name": "Shrimp" } ] }`
- **GET /units?q=tb&limit=10** → `200 { "data": [ { "unit_id": 2, "name": "tbsp" } ] }`
