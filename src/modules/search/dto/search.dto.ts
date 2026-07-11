import { t } from "elysia";
import { PaginationQueryDTO } from "../../../shared/utils/pagination";
import { RECIPE_SORTS } from "../../recipes/dto/recipes.dto";

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
    sort: t.Optional(
      t.Union(
        RECIPE_SORTS.map((s) => t.Literal(s)),
        { default: "newest" },
      ),
    ),
  }),
]);
export type SearchQueryInput = typeof SearchQueryDTO.static;

export const RecentKeywordParams = t.Object({ keyword: t.String({ minLength: 1 }) });

export const AutocompleteQueryDTO = t.Object({
  q: t.Optional(t.String()),
  limit: t.Optional(t.Numeric({ minimum: 1 })),
});

// ============================================================================
// Response DTOs
// ============================================================================

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
