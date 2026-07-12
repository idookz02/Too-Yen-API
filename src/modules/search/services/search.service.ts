import {
  searchRepository,
  type MatchCardRow,
  type SearchFilters,
  type SearchRepository,
} from "../repositories/search.repository";
import { mapRecipeCard } from "../../recipes/services/recipe-card";
import {
  storageService,
  type StorageService,
} from "../../../shared/services/storage.service";
import {
  mediaProcessingService,
  type MediaProcessingService,
} from "../../../shared/services/media-processing.service";
import {
  visionService,
  type VisionService,
} from "../../../shared/services/vision.service";
import { badRequest } from "../../../shared/utils/errors";
import { paginated, parsePagination } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import type { MatchQueryInput, SearchQueryInput } from "../dto/search.dto";

export const RECENT_SEARCH_LIMIT = 10; // decision 2026-07-10
const AUTOCOMPLETE_DEFAULT = 10;
const AUTOCOMPLETE_MAX = 20;

const parseCsvIds = (csv?: string): number[] =>
  csv ? [...new Set(csv.split(",").map(Number))] : [];

export type SearchServiceDeps = {
  repo?: SearchRepository;
  storage?: Pick<StorageService, "publicUrl">;
  vision?: Pick<VisionService, "analyzeFood">;
  media?: Pick<MediaProcessingService, "processImage">;
};

export class SearchService {
  private readonly repo: SearchRepository;
  private readonly storage: NonNullable<SearchServiceDeps["storage"]>;
  private readonly vision: NonNullable<SearchServiceDeps["vision"]>;
  private readonly media: NonNullable<SearchServiceDeps["media"]>;

  constructor(deps: SearchServiceDeps = {}) {
    this.repo = deps.repo ?? searchRepository;
    this.storage = deps.storage ?? storageService;
    this.vision = deps.vision ?? visionService;
    this.media = deps.media ?? mediaProcessingService;
  }

  // GET /search/recipes — keyword + advanced filters, AND-combined (AC 4)
  async search(query: SearchQueryInput, user: CurrentUser) {
    const { page, limit, offset } = parsePagination(query);
    const q = query.q?.trim();
    const filters: SearchFilters = {
      q: q || undefined,
      ingredientIds: parseCsvIds(query.ingredient_ids),
      equipmentIds: parseCsvIds(query.equipment_ids),
      maxCookTime: query.max_cook_time,
      skillLevelId: query.skill_level_id,
      categoryId: query.category_id,
    };

    // a real keyword is saved to recent searches automatically (AC M5)
    if (q) await this.repo.upsertRecent(user.userId, q);

    // omitted sort: relevance-first when searching by keyword (decision 2026-07-10)
    const sort = query.sort ?? (q ? "relevance" : "newest");
    const [rows, total] = await Promise.all([
      this.repo.searchCards(filters, { sort, limit, offset }, user.userId),
      this.repo.countSearch(filters),
    ]);
    return paginated(
      rows.map((r) => mapRecipeCard(r, user.userId, (b, p) => this.storage.publicUrl(b, p))),
      page,
      limit,
      total,
    );
  }

  /**
   * GET /search/match — pantry match (decision 2026-07-10): given what I have,
   * rank published recipes by how much of each recipe I can cover.
   * % per dimension = matched ÷ recipe total; match_pct = average of the
   * provided dimensions; recipes need ≥ 1 matched item, sorted best-first.
   */
  async match(query: MatchQueryInput, user: CurrentUser) {
    const ingredientIds = parseCsvIds(query.ingredient_ids);
    const equipmentIds = parseCsvIds(query.equipment_ids);
    if (ingredientIds.length === 0 && equipmentIds.length === 0) {
      throw badRequest(
        "Provide ingredient_ids and/or equipment_ids",
        "VALIDATION_ERROR",
      );
    }

    const { page, limit, offset } = parsePagination(query);
    const input = { ingredientIds, equipmentIds, minMatch: query.min_match };
    const [rows, total] = await Promise.all([
      this.repo.matchCards(input, { limit, offset }, user.userId),
      this.repo.countMatch(input),
    ]);

    const useIng = ingredientIds.length > 0;
    const useEq = equipmentIds.length > 0;
    return paginated(
      rows.map((r) => this.mapMatchCard(r, user, useIng, useEq)),
      page,
      limit,
      total,
    );
  }

  private mapMatchCard(
    row: MatchCardRow,
    user: CurrentUser,
    useIng: boolean,
    useEq: boolean,
  ) {
    const stat = (matched: number, total: number) => ({
      matched,
      total,
      pct: total > 0 ? Math.round((100 * matched) / total) : 0,
    });
    const ingredient_match = useIng ? stat(row.ingMatched, row.ingTotal) : null;
    const equipment_match = useEq ? stat(row.eqMatched, row.eqTotal) : null;
    const pcts = [ingredient_match?.pct, equipment_match?.pct].filter(
      (p): p is number => p !== undefined,
    );
    return {
      ...mapRecipeCard(row, user.userId, (b, p) => this.storage.publicUrl(b, p)),
      ingredient_match,
      equipment_match,
      match_pct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
    };
  }

  /**
   * POST /search/by-image (decision 2026-07-10) — one-shot: analyze a food
   * photo with GPT-4o-mini, then search the existing system with what was
   * found. Keyword hits (dish name, relevance-ranked) come first, then
   * pantry matches on the detected ingredients that exist in our DB.
   */
  async searchByImage(image: File, user: CurrentUser) {
    // downscale before sending to the vision API — fewer tokens, same answer
    const compressed = await this.media.processImage(image, "stepImage");
    const analysis = await this.vision.analyzeFood(compressed);

    // map detected ingredient names (either language) onto our ingredient rows
    const matched: { ingredientId: number; name: string }[] = [];
    for (const ing of analysis.ingredients) {
      const row = await this.repo.findIngredientByAnyName([ing.en, ing.th]);
      if (row && !matched.some((m) => m.ingredientId === row.ingredientId)) {
        matched.push(row);
      }
    }

    const LIMIT = 20;
    const publicUrl: Parameters<typeof mapRecipeCard>[2] = (b, p) =>
      this.storage.publicUrl(b, p);

    // 1) dish-name keyword search (relevance-ranked)
    const dishQuery = analysis.dish?.th || analysis.dish?.en || undefined;
    const keywordRows = dishQuery
      ? await this.repo.searchCards(
          { q: dishQuery, ingredientIds: [], equipmentIds: [] },
          { sort: "relevance", limit: LIMIT, offset: 0 },
          user.userId,
        )
      : [];

    // 2) pantry match on the detected ingredients
    const ingredientIds = matched.map((m) => m.ingredientId);
    const matchRows = ingredientIds.length
      ? await this.repo.matchCards(
          { ingredientIds, equipmentIds: [] },
          { limit: LIMIT, offset: 0 },
          user.userId,
        )
      : [];

    // merge: keyword hits first, then ingredient matches not already present.
    // Cards mirror the /search/match shape exactly (decision 2026-07-10) so
    // the UI reuses one component: nullable ingredient_match/equipment_match
    // on every card + an overall match_pct (dish-name hit = 100).
    type MatchStat = { matched: number; total: number; pct: number };
    type ByImageCard = ReturnType<typeof mapRecipeCard> & {
      ingredient_match: MatchStat | null;
      equipment_match: MatchStat | null;
      match_pct: number;
      matched_by: "dish" | "ingredients";
    };
    const seen = new Set<number>();
    const data: ByImageCard[] = [];
    for (const row of keywordRows) {
      seen.add(row.recipeId);
      data.push({
        ...mapRecipeCard(row, user.userId, publicUrl),
        ingredient_match: null,
        equipment_match: null, // image search never filters by equipment
        match_pct: 100, // the recognized dish name matched this recipe directly
        matched_by: "dish",
      });
    }
    for (const row of matchRows) {
      if (seen.has(row.recipeId) || data.length >= LIMIT) continue;
      seen.add(row.recipeId);
      const pct = row.ingTotal > 0 ? Math.round((100 * row.ingMatched) / row.ingTotal) : 0;
      data.push({
        ...mapRecipeCard(row, user.userId, publicUrl),
        ingredient_match: { matched: row.ingMatched, total: row.ingTotal, pct },
        equipment_match: null,
        match_pct: pct,
        matched_by: "ingredients",
      });
    }

    return {
      analysis: {
        dish_name: analysis.dish,
        ingredients_detected: analysis.ingredients,
        ingredients_matched: matched.map((m) => ({
          ingredient_id: m.ingredientId,
          name: m.name,
        })),
      },
      data,
    };
  }

  // GET /search/recent — latest first, capped at 10 (decision 2026-07-10)
  async getRecent(user: CurrentUser) {
    const rows = await this.repo.listRecent(user.userId, RECENT_SEARCH_LIMIT);
    return {
      keywords: rows.map((r) => ({
        keyword: r.keyword,
        searched_at: r.searchedAt.toISOString(),
      })),
    };
  }

  // DELETE /search/recent/{keyword} — idempotent 204
  async deleteRecent(keyword: string, user: CurrentUser) {
    await this.repo.deleteRecent(user.userId, keyword);
  }

  // GET /ingredients?q=
  async autocompleteIngredients(query: { q?: string; limit?: number }) {
    const rows = await this.repo.autocompleteIngredients(
      query.q?.trim() ?? "",
      this.clampLimit(query.limit),
    );
    return { data: rows.map((r) => ({ ingredient_id: r.ingredientId, name: r.name })) };
  }

  // GET /units?q=
  async autocompleteUnits(query: { q?: string; limit?: number }) {
    const rows = await this.repo.autocompleteUnits(
      query.q?.trim() ?? "",
      this.clampLimit(query.limit),
    );
    return { data: rows.map((r) => ({ unit_id: r.unitId, name: r.name })) };
  }

  private clampLimit(limit?: number): number {
    return Math.min(AUTOCOMPLETE_MAX, Math.max(1, limit ?? AUTOCOMPLETE_DEFAULT));
  }
}

export const searchService = new SearchService();
