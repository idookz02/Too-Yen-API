import {
  searchRepository,
  type SearchFilters,
  type SearchRepository,
} from "../repositories/search.repository";
import { mapRecipeCard } from "../../recipes/services/recipe-card";
import {
  storageService,
  type StorageService,
} from "../../../shared/services/storage.service";
import { paginated, parsePagination } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import type { SearchQueryInput } from "../dto/search.dto";

export const RECENT_SEARCH_LIMIT = 10; // decision 2026-07-10
const AUTOCOMPLETE_DEFAULT = 10;
const AUTOCOMPLETE_MAX = 20;

const parseCsvIds = (csv?: string): number[] =>
  csv ? [...new Set(csv.split(",").map(Number))] : [];

export type SearchServiceDeps = {
  repo?: SearchRepository;
  storage?: Pick<StorageService, "publicUrl">;
};

export class SearchService {
  private readonly repo: SearchRepository;
  private readonly storage: NonNullable<SearchServiceDeps["storage"]>;

  constructor(deps: SearchServiceDeps = {}) {
    this.repo = deps.repo ?? searchRepository;
    this.storage = deps.storage ?? storageService;
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

    const [rows, total] = await Promise.all([
      this.repo.searchCards(filters, { sort: query.sort ?? "newest", limit, offset }, user.userId),
      this.repo.countSearch(filters),
    ]);
    return paginated(
      rows.map((r) => mapRecipeCard(r, user.userId, (b, p) => this.storage.publicUrl(b, p))),
      page,
      limit,
      total,
    );
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
