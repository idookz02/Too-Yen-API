/**
 * SearchService unit tests with a mock repository — CSV parsing, recent-search
 * behaviour, autocomplete clamping, card envelope.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { RECENT_SEARCH_LIMIT, SearchService } from "../src/modules/search/services/search.service";
import { AppError } from "../src/shared/utils/errors";
import type {
  MatchCardRow,
  MatchInput,
  SearchFilters,
  SearchRepository,
} from "../src/modules/search/repositories/search.repository";
import type { CardRow } from "../src/modules/recipes/repositories/recipes.repository";

const cardRow = (over: Partial<CardRow> = {}): CardRow => ({
  recipeId: 1,
  recipeName: "Tom Yum Goong",
  status: "published",
  publishedAt: new Date("2026-07-09T08:00:00Z"),
  authorId: 2,
  authorName: "Sak",
  tierName: "Silver",
  coverPath: "1/cover.webp",
  likeCount: 45,
  favoriteCount: 12,
  commentCount: 3,
  likedByMe: true,
  favoritedByMe: false,
  ...over,
});

type State = {
  capturedFilters: SearchFilters[];
  capturedSorts: string[];
  capturedMatch: MatchInput[];
  upserts: { userId: number; keyword: string }[];
  recentCalls: number[];
  recent: { keyword: string; searchedAt: Date }[];
  deleted: string[];
  autocompleteCalls: { q: string; limit: number }[];
  rows: CardRow[];
  matchRows: MatchCardRow[];
};

let state: State;
let service: SearchService;

beforeEach(() => {
  state = {
    capturedFilters: [],
    capturedSorts: [],
    capturedMatch: [],
    upserts: [],
    recentCalls: [],
    recent: [],
    deleted: [],
    autocompleteCalls: [],
    rows: [],
    matchRows: [],
  };
  const repo = {
    searchCards: async (filters: SearchFilters, opts: { sort: string }) => {
      state.capturedFilters.push(filters);
      state.capturedSorts.push(opts.sort);
      return state.rows;
    },
    countSearch: async () => state.rows.length,
    matchCards: async (input: MatchInput) => {
      state.capturedMatch.push(input);
      return state.matchRows;
    },
    countMatch: async () => state.matchRows.length,
    upsertRecent: async (userId: number, keyword: string) => {
      state.upserts.push({ userId, keyword });
    },
    listRecent: async (_userId: number, limit: number) => {
      state.recentCalls.push(limit);
      return state.recent;
    },
    deleteRecent: async (_userId: number, keyword: string) => {
      state.deleted.push(keyword);
    },
    autocompleteIngredients: async (q: string, limit: number) => {
      state.autocompleteCalls.push({ q, limit });
      return [{ ingredientId: 5, name: "Shrimp" }];
    },
    autocompleteUnits: async (q: string, limit: number) => {
      state.autocompleteCalls.push({ q, limit });
      return [{ unitId: 2, name: "tbsp" }];
    },
  };
  service = new SearchService({
    repo: repo as unknown as SearchRepository,
    storage: { publicUrl: (b: string, p: string) => `https://cdn.test/${b}/${p}` } as never,
  });
});

const user = { userId: 1, role: "user" };

describe("search", () => {
  it("parses CSV ids and passes every filter AND-combined", async () => {
    await service.search(
      {
        q: "tom yum",
        ingredient_ids: "5,8",
        equipment_ids: "1,4",
        max_cook_time: 30,
        skill_level_id: 1,
        category_id: 3,
      },
      user,
    );
    expect(state.capturedFilters[0]).toEqual({
      q: "tom yum",
      ingredientIds: [5, 8],
      equipmentIds: [1, 4],
      maxCookTime: 30,
      skillLevelId: 1,
      categoryId: 3,
    });
  });

  it("saves a trimmed keyword to recent searches", async () => {
    await service.search({ q: "  tom yum  " }, user);
    expect(state.upserts).toEqual([{ userId: 1, keyword: "tom yum" }]);
  });

  it("does not save when q is missing or blank", async () => {
    await service.search({}, user);
    await service.search({ q: "   " }, user);
    expect(state.upserts).toHaveLength(0);
  });

  it("defaults to relevance sort when q is present, newest otherwise", async () => {
    await service.search({ q: "tom yum" }, user);
    await service.search({}, user);
    await service.search({ q: "   " }, user); // blank q -> no keyword -> newest
    expect(state.capturedSorts).toEqual(["relevance", "newest", "newest"]);
  });

  it("an explicit sort always overrides the relevance default", async () => {
    await service.search({ q: "tom yum", sort: "most_liked" }, user);
    expect(state.capturedSorts).toEqual(["most_liked"]);
  });

  it("dedupes repeated ids in the CSV", async () => {
    await service.search({ ingredient_ids: "5,5,8" }, user);
    expect(state.capturedFilters[0]!.ingredientIds).toEqual([5, 8]);
  });

  it("returns cards in the pagination envelope (empty data on no match)", async () => {
    const res = await service.search({ q: "nothing" }, user);
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);

    state.rows = [cardRow()];
    const res2 = await service.search({}, user);
    expect(res2.data[0]).toMatchObject({
      recipe_id: 1,
      liked_by_me: true,
      is_owner: false,
      cover_image_url: "https://cdn.test/recipe-media/1/cover.webp",
    });
  });
});

describe("match (pantry search)", () => {
  const matchRow = (over: Partial<MatchCardRow> = {}): MatchCardRow => ({
    ...cardRow(),
    ingMatched: 4,
    ingTotal: 5,
    eqMatched: 1,
    eqTotal: 2,
    ...over,
  });

  it("400 when neither list is provided", async () => {
    try {
      await service.match({}, user);
      throw new Error("expected AppError");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("computes per-dimension pct against the recipe and averages match_pct", async () => {
    state.matchRows = [matchRow()]; // 4/5 = 80%, 1/2 = 50%
    const res = await service.match(
      { ingredient_ids: "5,8,12", equipment_ids: "1,4" },
      user,
    );
    expect(res.data[0]).toMatchObject({
      ingredient_match: { matched: 4, total: 5, pct: 80 },
      equipment_match: { matched: 1, total: 2, pct: 50 },
      match_pct: 65, // (80 + 50) / 2
    });
  });

  it("a single dimension yields that pct and null for the other", async () => {
    state.matchRows = [matchRow({ eqMatched: 0, eqTotal: 3 })];
    const res = await service.match({ ingredient_ids: "5,8" }, user);
    expect(res.data[0]).toMatchObject({
      ingredient_match: { matched: 4, total: 5, pct: 80 },
      equipment_match: null,
      match_pct: 80,
    });
  });

  it("passes parsed ids and min_match to the repository", async () => {
    await service.match(
      { ingredient_ids: "5,5,8", equipment_ids: "1", min_match: 50 },
      user,
    );
    expect(state.capturedMatch[0]).toEqual({
      ingredientIds: [5, 8],
      equipmentIds: [1],
      minMatch: 50,
    });
  });

  it("keeps the recipe-card shape alongside the match fields", async () => {
    state.matchRows = [matchRow()];
    const res = await service.match({ ingredient_ids: "5" }, user);
    expect(res.data[0]).toMatchObject({
      recipe_id: 1,
      cover_image_url: "https://cdn.test/recipe-media/1/cover.webp",
      author: { display_name: "Sak" },
    });
    expect(res.pagination.total).toBe(1);
  });
});

describe("searchByImage (one-shot photo search)", () => {
  const png = () => new File(["x"], "food.png", { type: "image/png" });

  const withVision = (analysis: {
    dish: { th: string; en: string } | null;
    ingredients: { th: string; en: string }[];
    equipment?: { th: string; en: string }[];
  }) =>
    new SearchService({
      repo: {
        searchCards: async (filters: SearchFilters, opts: { sort: string }) => {
          state.capturedFilters.push(filters);
          state.capturedSorts.push(opts.sort);
          return state.rows;
        },
        countSearch: async () => state.rows.length,
        matchCards: async (input: MatchInput) => {
          state.capturedMatch.push(input);
          return state.matchRows;
        },
        countMatch: async () => state.matchRows.length,
        findIngredientByAnyName: async (candidates: string[]) => {
          // pretend only "Shrimp" exists in the DB
          return candidates.some((c) => c === "Shrimp")
            ? { ingredientId: 5, name: "Shrimp" }
            : null;
        },
        findEquipmentByAnyName: async (candidates: string[]) => {
          // pretend only "Pot" exists in the DB
          return candidates.some((c) => c === "Pot")
            ? { equipmentId: 1, name: "Pot" }
            : null;
        },
      } as unknown as SearchRepository,
      storage: { publicUrl: (b: string, p: string) => `https://cdn.test/${b}/${p}` } as never,
      vision: { analyzeFood: async () => ({ equipment: [], ...analysis }) },
      media: { processImage: async (f: File) => f },
    });

  it("keyword hits come first, then deduped pantry matches with pct", async () => {
    state.rows = [cardRow({ recipeId: 1 })];
    state.matchRows = [
      { ...cardRow({ recipeId: 1 }), ingMatched: 1, ingTotal: 1, eqMatched: 0, eqTotal: 0 }, // dup
      { ...cardRow({ recipeId: 2 }), ingMatched: 1, ingTotal: 4, eqMatched: 0, eqTotal: 0 },
    ];
    const service = withVision({
      dish: { th: "ต้มยำกุ้ง", en: "Tom Yum Goong" },
      ingredients: [
        { th: "กุ้ง", en: "Shrimp" },
        { th: "ไม่มีในระบบ", en: "Unknown Thing" },
      ],
    });

    const res = await service.searchByImage(png(), user);
    expect(res.analysis.dish_name).toEqual({ th: "ต้มยำกุ้ง", en: "Tom Yum Goong" });
    expect(res.analysis.ingredients_matched).toEqual([{ ingredient_id: 5, name: "Shrimp" }]);
    // searched with the Thai dish name, relevance-ranked
    expect(state.capturedFilters[0]!.q).toBe("ต้มยำกุ้ง");
    expect(state.capturedSorts[0]).toBe("relevance");
    // pantry match used only the ingredient that exists in the DB
    expect(state.capturedMatch[0]!.ingredientIds).toEqual([5]);
    // merge: recipe 1 once (keyword-first), recipe 2 from ingredients with pct
    expect(res.data.map((c) => c.recipe_id)).toEqual([1, 2]);
    // cards mirror the /search/match shape exactly (UI reuses one component)
    expect(res.data[0]!).toMatchObject({
      matched_by: "dish",
      ingredient_match: null,
      equipment_match: null,
      match_pct: 100,
    });
    expect(res.data[1]!).toMatchObject({
      matched_by: "ingredients",
      ingredient_match: { matched: 1, total: 4, pct: 25 },
      equipment_match: null,
      match_pct: 25,
    });
    // every card carries every /search/match field — nothing optional/omitted
    for (const card of res.data) {
      expect(Object.keys(card)).toEqual(
        expect.arrayContaining(["ingredient_match", "equipment_match", "match_pct", "matched_by"]),
      );
    }
  });

  it("detected equipment feeds the match and yields equipment_match + averaged pct", async () => {
    state.matchRows = [
      // 1/4 ingredients (25%) + 1/2 equipment (50%) -> match_pct 38
      { ...cardRow({ recipeId: 3 }), ingMatched: 1, ingTotal: 4, eqMatched: 1, eqTotal: 2 },
    ];
    const service = withVision({
      dish: null,
      ingredients: [{ th: "กุ้ง", en: "Shrimp" }],
      equipment: [
        { th: "หม้อ", en: "Pot" },
        { th: "เตาถ่าน", en: "Charcoal Stove" }, // not in DB -> skipped
      ],
    });
    const res = await service.searchByImage(png(), user);
    expect(res.analysis.equipment_matched).toEqual([{ equipment_id: 1, name: "Pot" }]);
    expect(state.capturedMatch[0]).toMatchObject({ ingredientIds: [5], equipmentIds: [1] });
    expect(res.data[0]!).toMatchObject({
      ingredient_match: { matched: 1, total: 4, pct: 25 },
      equipment_match: { matched: 1, total: 2, pct: 50 },
      match_pct: 38, // (25 + 50) / 2 rounded
    });
  });

  it("equipment alone (no ingredients matched) still searches", async () => {
    state.matchRows = [
      { ...cardRow({ recipeId: 4 }), ingMatched: 0, ingTotal: 3, eqMatched: 1, eqTotal: 1 },
    ];
    const service = withVision({
      dish: null,
      ingredients: [],
      equipment: [{ th: "หม้อ", en: "Pot" }],
    });
    const res = await service.searchByImage(png(), user);
    expect(state.capturedMatch[0]).toMatchObject({ ingredientIds: [], equipmentIds: [1] });
    expect(res.data[0]!).toMatchObject({
      ingredient_match: null, // ingredient list wasn't provided to the match
      equipment_match: { matched: 1, total: 1, pct: 100 },
      match_pct: 100,
    });
  });

  it("no dish recognized -> ingredient path only", async () => {
    state.matchRows = [
      { ...cardRow({ recipeId: 7 }), ingMatched: 1, ingTotal: 2, eqMatched: 0, eqTotal: 0 },
    ];
    const service = withVision({
      dish: null,
      ingredients: [{ th: "กุ้ง", en: "Shrimp" }],
    });
    const res = await service.searchByImage(png(), user);
    expect(state.capturedFilters).toHaveLength(0); // keyword search never ran
    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.matched_by).toBe("ingredients");
  });

  it("nothing usable -> 200 with empty data (frontend shows no-result)", async () => {
    const service = withVision({ dish: null, ingredients: [] });
    const res = await service.searchByImage(png(), user);
    expect(res.data).toEqual([]);
    expect(res.analysis.ingredients_matched).toEqual([]);
  });
});

describe("recent searches", () => {
  it("lists latest first with the 10-item cap and ISO timestamps", async () => {
    state.recent = [{ keyword: "tom yum", searchedAt: new Date("2026-07-10T01:00:00Z") }];
    const res = await service.getRecent(user);
    expect(state.recentCalls).toEqual([RECENT_SEARCH_LIMIT]);
    expect(res).toEqual({
      keywords: [{ keyword: "tom yum", searched_at: "2026-07-10T01:00:00.000Z" }],
    });
  });

  it("delete passes the keyword through (idempotent)", async () => {
    await service.deleteRecent("tom yum", user);
    expect(state.deleted).toEqual(["tom yum"]);
  });
});

describe("autocomplete", () => {
  it("defaults to limit 10 and maps ids", async () => {
    const res = await service.autocompleteIngredients({ q: "shr" });
    expect(state.autocompleteCalls[0]).toEqual({ q: "shr", limit: 10 });
    expect(res.data).toEqual([{ ingredient_id: 5, name: "Shrimp" }]);
  });

  it("clamps limit to 20", async () => {
    await service.autocompleteUnits({ q: "tb", limit: 500 });
    expect(state.autocompleteCalls[0]).toEqual({ q: "tb", limit: 20 });
  });
});
