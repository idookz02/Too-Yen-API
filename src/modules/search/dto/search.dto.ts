import { t } from "elysia";
import { PaginationQueryDTO } from "../../../shared/utils/pagination";
import { RECIPE_SORTS, RecipeCardDTO } from "../../recipes/dto/recipes.dto";

// ============================================================================
// Request DTOs (doc/api/05-search.md)
// ============================================================================

const CSV_IDS = "^\\d+(,\\d+)*$";

export const SearchQueryDTO = t.Composite([
  PaginationQueryDTO,
  t.Object({
    q: t.Optional(t.String({ description: "Keyword against name/description" })),
    ingredient_ids: t.Optional(
      t.String({
        pattern: CSV_IDS,
        description: "CSV — recipe must contain ALL listed ingredients",
        examples: ["5,8"],
      }),
    ),
    equipment_ids: t.Optional(
      t.String({
        pattern: CSV_IDS,
        description: "CSV — recipe uses ANY of the listed equipment",
        examples: ["1,4"],
      }),
    ),
    max_cook_time: t.Optional(t.Numeric({ minimum: 1 })),
    skill_level_id: t.Optional(t.Numeric({ minimum: 1 })),
    category_id: t.Optional(t.Numeric({ minimum: 1 })),
    // no schema default on purpose — omitted sort means "relevance when q is
    // present, newest otherwise" (decision 2026-07-10)
    sort: t.Optional(
      t.Union([...RECIPE_SORTS.map((s) => t.Literal(s)), t.Literal("relevance")]),
    ),
  }),
]);
export type SearchQueryInput = typeof SearchQueryDTO.static;

/** GET /search/match — pantry match (decision 2026-07-10). ≥1 of the two lists required. */
export const MatchQueryDTO = t.Composite([
  PaginationQueryDTO,
  t.Object({
    ingredient_ids: t.Optional(
      t.String({ pattern: CSV_IDS, description: "CSV — ingredients I have", examples: ["5,8,12"] }),
    ),
    equipment_ids: t.Optional(
      t.String({ pattern: CSV_IDS, description: "CSV — equipment I have", examples: ["1,4"] }),
    ),
    min_match: t.Optional(
      t.Numeric({ minimum: 0, maximum: 100, description: "Overall match_pct floor" }),
    ),
  }),
]);
export type MatchQueryInput = typeof MatchQueryDTO.static;

/** POST /search/by-image — one food photo (decision 2026-07-10). */
export const ByImageBodyDTO = t.Object({
  image: t.File({ type: "image" }),
});

const BilingualName = t.Object({ th: t.String(), en: t.String() });

export const ByImageResponseDTO = t.Object({
  analysis: t.Object({
    dish_name: t.Union([BilingualName, t.Null()]),
    ingredients_detected: t.Array(BilingualName),
    ingredients_matched: t.Array(
      t.Object({ ingredient_id: t.Number(), name: t.String() }),
    ),
    equipment_detected: t.Array(BilingualName),
    equipment_matched: t.Array(
      t.Object({ equipment_id: t.Number(), name: t.String() }),
    ),
  }),
  // cards use the SAME shape as /search/match so the UI can reuse one
  // component (decision 2026-07-10): ingredient_match / equipment_match are
  // always present (null when not applicable) and every card has match_pct —
  // 100 for dish-name hits, the ingredient pct otherwise. matched_by is an
  // additive extra telling the UI why the card is here.
  data: t.Array(
    t.Composite([
      RecipeCardDTO,
      t.Object({
        ingredient_match: t.Union([
          t.Object({ matched: t.Number(), total: t.Number(), pct: t.Number() }),
          t.Null(),
        ]),
        equipment_match: t.Union([
          t.Object({ matched: t.Number(), total: t.Number(), pct: t.Number() }),
          t.Null(),
        ]),
        match_pct: t.Number(),
        matched_by: t.Union([t.Literal("dish"), t.Literal("ingredients")]),
      }),
    ]),
  ),
});

export const RecentKeywordParams = t.Object({ keyword: t.String({ minLength: 1 }) });

export const AutocompleteQueryDTO = t.Object({
  q: t.Optional(t.String()),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

// ============================================================================
// Response DTOs
// ============================================================================

const MatchStatDTO = t.Object({
  matched: t.Number({ description: "Items of the recipe I have" }),
  total: t.Number({ description: "Items the recipe needs" }),
  pct: t.Number({ description: "matched / total × 100, rounded" }),
});

export const MatchResponseDTO = t.Object({
  data: t.Array(
    t.Composite([
      RecipeCardDTO,
      t.Object({
        ingredient_match: t.Union([MatchStatDTO, t.Null()]),
        equipment_match: t.Union([MatchStatDTO, t.Null()]),
        match_pct: t.Number({
          description: "Average of the provided dimensions' pct",
        }),
      }),
    ]),
  ),
  pagination: t.Object({
    page: t.Number(),
    limit: t.Number(),
    total: t.Number(),
    total_pages: t.Number(),
  }),
});

export const RecentSearchResponseDTO = t.Object({
  keywords: t.Array(
    t.Object({
      keyword: t.String(),
      searched_at: t.String({ format: "date-time" }),
    }),
  ),
});

export const IngredientAutocompleteDTO = t.Object({
  data: t.Array(t.Object({ ingredient_id: t.Number(), name: t.String() })),
});

export const UnitAutocompleteDTO = t.Object({
  data: t.Array(t.Object({ unit_id: t.Number(), name: t.String() })),
});
