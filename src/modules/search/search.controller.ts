import { Elysia, t } from "elysia";
import { authPlugin } from "../../shared/plugins/auth.plugin";
import { rateLimit } from "../../shared/plugins/rate-limit.plugin";
import { searchService } from "./services/search.service";
import { FeedResponseDTO } from "../recipes/dto/recipes.dto";
import {
  AutocompleteQueryDTO,
  ByImageBodyDTO,
  ByImageResponseDTO,
  EquipmentAutocompleteDTO,
  IngredientAutocompleteDTO,
  MatchQueryDTO,
  MatchResponseDTO,
  RecentKeywordParams,
  RecentSearchResponseDTO,
  SearchQueryDTO,
  UnitAutocompleteDTO,
} from "./dto/search.dto";

/**
 * POST /search/by-image lives on its own instance so the rate limit applies
 * to it alone — every call costs real money (GPT-4o-mini).
 */
export const imageSearchController = new Elysia()
  .use(
    rateLimit({
      name: "image-search",
      max: Number(process.env.RATE_LIMIT_IMAGE_SEARCH_MAX ?? 5),
    }),
  )
  .use(authPlugin)
  .post(
    "/search/by-image",
    ({ body, currentUser }) => searchService.searchByImage(body.image, currentUser),
    {
      body: ByImageBodyDTO,
      response: { 200: ByImageResponseDTO },
      detail: {
        tags: ["Search"],
        summary: "Search recipes from a food photo",
        description:
          "One-shot: GPT-4o-mini identifies the dish + ingredients, then searches — " +
          "dish-name keyword hits first (relevance), then pantry matches on detected " +
          "ingredients. Rate-limited (5/min per IP). 503 FEATURE_DISABLED without " +
          "OPENAI_API_KEY; 502 VISION_API_ERROR on upstream failures.",
      },
    },
  );

/** Module 5 — Search (doc/api/05-search.md). Bearer on all routes; published posts only. */
export const searchController = new Elysia()
  .use(authPlugin)

  // GET /search/recipes — keyword + advanced filters in one endpoint
  .get(
    "/search/recipes",
    ({ query, currentUser }) => searchService.search(query, currentUser),
    {
      query: SearchQueryDTO,
      response: { 200: FeedResponseDTO },
      detail: {
        tags: ["Search"],
        summary: "Search recipes",
        description:
          "All filters AND-combined (AC 4). ingredient_ids = recipe contains ALL; " +
          "equipment_ids = uses ANY. A non-empty q is saved to recent searches.",
      },
    },
  )

  // GET /search/match — pantry match with match percentages
  .get(
    "/search/match",
    ({ query, currentUser }) => searchService.match(query, currentUser),
    {
      query: MatchQueryDTO,
      response: { 200: MatchResponseDTO },
      detail: {
        tags: ["Search"],
        summary: "Match recipes against my ingredients/equipment",
        description:
          "Rank published recipes by how much of each recipe the given ingredient_ids/" +
          "equipment_ids cover (% = matched ÷ recipe total per dimension; match_pct = average " +
          "of the provided dimensions). Needs ≥ 1 matched item; sorted match_pct desc, " +
          "then newest. Optional min_match=0-100 floor. At least one list is required.",
      },
    },
  )

  // GET /search/recent
  .get("/search/recent", ({ currentUser }) => searchService.getRecent(currentUser), {
    response: { 200: RecentSearchResponseDTO },
    detail: {
      tags: ["Search"],
      summary: "Recent searches",
      description: "Latest first, capped at 10.",
    },
  })

  // DELETE /search/recent/{keyword}
  .delete(
    "/search/recent/:keyword",
    async ({ params, currentUser, set }) => {
      await searchService.deleteRecent(params.keyword, currentUser);
      set.status = 204;
    },
    {
      params: RecentKeywordParams,
      response: { 204: t.Void() },
      detail: {
        tags: ["Search"],
        summary: "Remove a recent keyword",
        description: "Idempotent — removing an unknown keyword still returns 204.",
      },
    },
  )

  // GET /ingredients?q= — autocomplete for form inputs + filters
  .get("/ingredients", ({ query }) => searchService.autocompleteIngredients(query), {
    query: AutocompleteQueryDTO,
    response: { 200: IngredientAutocompleteDTO },
    detail: {
      tags: ["Search"],
      summary: "Ingredient autocomplete",
      description:
        "Case-insensitive **prefix** match on active ingredient names (`is_active = true`, " +
        "soft-deleted hidden), ordered by name. `limit` default 10, max 20. Blank/omitted `q` " +
        "returns the first `limit` names. Bearer required. Example: `?q=shr` → `[{ ingredient_id: 5, name: \"Shrimp\" }]`.",
    },
  })

  // GET /units?q=
  .get("/units", ({ query }) => searchService.autocompleteUnits(query), {
    query: AutocompleteQueryDTO,
    response: { 200: UnitAutocompleteDTO },
    detail: {
      tags: ["Search"],
      summary: "Unit autocomplete",
      description:
        "Case-insensitive **prefix** match on active unit names (`is_active = true`, " +
        "soft-deleted hidden), ordered by name. `limit` default 10, max 20. Blank/omitted `q` " +
        "returns the first `limit` names. Bearer required. Example: `?q=tb` → `[{ unit_id: 2, name: \"tbsp\" }]`.",
    },
  })

  // GET /equipment?q= — autocomplete (extends spec; mirrors /ingredients + /units)
  .get("/equipment", ({ query }) => searchService.autocompleteEquipment(query), {
    query: AutocompleteQueryDTO,
    response: { 200: EquipmentAutocompleteDTO },
    detail: {
      tags: ["Search"],
      summary: "Equipment autocomplete",
      description:
        "Case-insensitive **prefix** match on active equipment names (`is_active = true`, " +
        "soft-deleted hidden), ordered by name. `limit` default 10, max 20. Blank/omitted `q` " +
        "returns the first `limit` names. Bearer required. Example: `?q=wo` → `[{ equipment_id: 7, name: \"Wok\" }]`.",
    },
  });
