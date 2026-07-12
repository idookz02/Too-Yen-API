import { and, asc, desc, eq, ilike, lte, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import {
  ingredient,
  masterEquipment,
  masterTier,
  recentSearch,
  recipe,
  unit,
  users,
} from "../../../db/schema";
import {
  cardSelect,
  SORT_ORDER,
  type CardRow,
} from "../../recipes/repositories/recipes.repository";
import type { RecipeSort } from "../../recipes/dto/recipes.dto";

export type SearchFilters = {
  q?: string;
  ingredientIds: number[];
  equipmentIds: number[];
  maxCookTime?: number;
  skillLevelId?: number;
  categoryId?: number;
};

/** "relevance" is the default when q is present (decision 2026-07-10). */
export type SearchSort = RecipeSort | "relevance";

const tokenize = (q?: string): string[] => q?.trim().split(/\s+/).filter(Boolean) ?? [];

/**
 * One keyword token matched against every covered surface (decision
 * 2026-07-10): recipe name/description, ingredient names, author display
 * name, master names (category/method/equipment), and step instructions.
 * ILIKE substring — Postgres FTS can't tokenize Thai text.
 */
const tokenCondition = (token: string): SQL => {
  const p = `%${token}%`;
  return sql`(
    ${recipe.recipeName} ilike ${p}
    or ${recipe.description} ilike ${p}
    or ${users.displayName} ilike ${p}
    or exists (select 1 from recipe_ingredient ri join ingredient ing on ing.ingredient_id = ri.ingredient_id
               where ri.recipe_id = ${recipe.recipeId} and ing.name ilike ${p})
    or exists (select 1 from master_category mc where mc.category_id = ${recipe.categoryId} and mc.name ilike ${p})
    or exists (select 1 from master_cooking_method mm where mm.cooking_method_id = ${recipe.cookingMethodId} and mm.name ilike ${p})
    or exists (select 1 from recipe_equipment re join master_equipment me on me.equipment_id = re.equipment_id
               where re.recipe_id = ${recipe.recipeId} and me.name ilike ${p})
    or exists (select 1 from cooking_step cs where cs.recipe_id = ${recipe.recipeId} and cs.instruction ilike ${p})
  )`;
};

/** Weighted score for ORDER BY: name > ingredients > author > master > description > steps. */
const relevanceScore = (tokens: string[]): SQL => {
  const anyToken = (perToken: (pattern: string) => SQL) =>
    sql.join(tokens.map((t) => perToken(`%${t}%`)), sql` or `);
  return sql`(
    (case when (${anyToken((p) => sql`${recipe.recipeName} ilike ${p}`)}) then 100 else 0 end)
    + (case when (${anyToken((p) => sql`exists (select 1 from recipe_ingredient ri join ingredient ing on ing.ingredient_id = ri.ingredient_id where ri.recipe_id = ${recipe.recipeId} and ing.name ilike ${p})`)}) then 50 else 0 end)
    + (case when (${anyToken((p) => sql`${users.displayName} ilike ${p}`)}) then 30 else 0 end)
    + (case when (${anyToken((p) => sql`exists (select 1 from master_category mc where mc.category_id = ${recipe.categoryId} and mc.name ilike ${p}) or exists (select 1 from master_cooking_method mm where mm.cooking_method_id = ${recipe.cookingMethodId} and mm.name ilike ${p}) or exists (select 1 from recipe_equipment re join master_equipment me on me.equipment_id = re.equipment_id where re.recipe_id = ${recipe.recipeId} and me.name ilike ${p})`)}) then 20 else 0 end)
    + (case when (${anyToken((p) => sql`${recipe.description} ilike ${p}`)}) then 15 else 0 end)
    + (case when (${anyToken((p) => sql`exists (select 1 from cooking_step cs where cs.recipe_id = ${recipe.recipeId} and cs.instruction ilike ${p})`)}) then 5 else 0 end)
  )`;
};

/** All filters AND-combined (AC 4); published posts only. */
function buildConditions(filters: SearchFilters): SQL[] {
  const conditions: SQL[] = [eq(recipe.status, "published")];

  // multi-word q: every token must match somewhere (decision 2026-07-10)
  for (const token of tokenize(filters.q)) {
    conditions.push(tokenCondition(token));
  }
  if (filters.ingredientIds.length > 0) {
    // ALL semantics (ADR-001): the recipe must contain every listed ingredient
    const ids = sql.join(filters.ingredientIds.map((i) => sql`${i}`), sql`, `);
    conditions.push(
      sql`${recipe.recipeId} in (
        select ri.recipe_id from recipe_ingredient ri
        where ri.ingredient_id in (${ids})
        group by ri.recipe_id
        having count(distinct ri.ingredient_id) = ${filters.ingredientIds.length}
      )`,
    );
  }
  if (filters.equipmentIds.length > 0) {
    // ANY semantics (decision 2026-07-10): uses at least one listed equipment
    const ids = sql.join(filters.equipmentIds.map((i) => sql`${i}`), sql`, `);
    conditions.push(
      sql`exists (
        select 1 from recipe_equipment re
        where re.recipe_id = ${recipe.recipeId} and re.equipment_id in (${ids})
      )`,
    );
  }
  if (filters.maxCookTime != null) {
    conditions.push(lte(recipe.cookTimeMinutes, filters.maxCookTime));
  }
  if (filters.skillLevelId != null) {
    conditions.push(eq(recipe.skillLevelId, filters.skillLevelId));
  }
  if (filters.categoryId != null) {
    conditions.push(eq(recipe.categoryId, filters.categoryId));
  }
  return conditions;
}

export type MatchInput = {
  ingredientIds: number[];
  equipmentIds: number[];
  minMatch?: number;
};

export type MatchCardRow = CardRow & {
  ingMatched: number;
  ingTotal: number;
  eqMatched: number;
  eqTotal: number;
};

const idList = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

/**
 * Pantry-match fragments (decision 2026-07-10): % is measured against the
 * RECIPE's needs — matched ÷ recipe total per dimension; overall = average of
 * the provided dimensions. Recipes qualify with ≥ 1 matched item.
 */
function matchFragments(input: MatchInput) {
  const useIng = input.ingredientIds.length > 0;
  const useEq = input.equipmentIds.length > 0;

  const ingMatched = useIng
    ? sql<number>`(select count(*) from recipe_ingredient ri where ri.recipe_id = ${recipe.recipeId} and ri.ingredient_id in (${idList(input.ingredientIds)}))`.mapWith(Number)
    : sql<number>`0`.mapWith(Number);
  const ingTotal = sql<number>`(select count(*) from recipe_ingredient ri where ri.recipe_id = ${recipe.recipeId})`.mapWith(Number);
  const eqMatched = useEq
    ? sql<number>`(select count(*) from recipe_equipment re where re.recipe_id = ${recipe.recipeId} and re.equipment_id in (${idList(input.equipmentIds)}))`.mapWith(Number)
    : sql<number>`0`.mapWith(Number);
  const eqTotal = sql<number>`(select count(*) from recipe_equipment re where re.recipe_id = ${recipe.recipeId})`.mapWith(Number);

  const ingPct = sql`coalesce(100.0 * (${ingMatched}) / nullif((${ingTotal}), 0), 0)`;
  const eqPct = sql`coalesce(100.0 * (${eqMatched}) / nullif((${eqTotal}), 0), 0)`;
  const overallPct =
    useIng && useEq ? sql`((${ingPct}) + (${eqPct})) / 2` : useIng ? ingPct : eqPct;

  const conditions: SQL[] = [
    eq(recipe.status, "published"),
    sql`((${ingMatched}) + (${eqMatched})) >= 1`,
  ];
  if (input.minMatch != null) {
    conditions.push(sql`(${overallPct}) >= ${input.minMatch}`);
  }
  return { ingMatched, ingTotal, eqMatched, eqTotal, overallPct, conditions };
}

export class SearchRepository {
  // ===== pantry match (GET /search/match) =====

  async matchCards(
    input: MatchInput,
    opts: { limit: number; offset: number },
    currentUserId: number,
    executor: Executor = db,
  ): Promise<MatchCardRow[]> {
    const f = matchFragments(input);
    return executor
      .select({
        ...cardSelect(currentUserId),
        ingMatched: f.ingMatched,
        ingTotal: f.ingTotal,
        eqMatched: f.eqMatched,
        eqTotal: f.eqTotal,
      })
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(and(...f.conditions))
      .orderBy(desc(f.overallPct), desc(recipe.publishedAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countMatch(input: MatchInput, executor: Executor = db): Promise<number> {
    const f = matchFragments(input);
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipe)
      .where(and(...f.conditions));
    return row?.total ?? 0;
  }

  async searchCards(
    filters: SearchFilters,
    opts: { sort: SearchSort; limit: number; offset: number },
    currentUserId: number,
    executor: Executor = db,
  ): Promise<CardRow[]> {
    const tokens = tokenize(filters.q);
    const orderBy =
      opts.sort === "relevance" && tokens.length > 0
        ? [desc(relevanceScore(tokens)), desc(recipe.publishedAt)]
        : SORT_ORDER[opts.sort === "relevance" ? "newest" : opts.sort];
    return executor
      .select(cardSelect(currentUserId))
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(and(...buildConditions(filters)))
      .orderBy(...orderBy)
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countSearch(filters: SearchFilters, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipe)
      // author display_name is one of the q surfaces, so the join is required here too
      .innerJoin(users, eq(recipe.userId, users.userId))
      .where(and(...buildConditions(filters)));
    return row?.total ?? 0;
  }

  // ===== recent searches =====

  /** Upsert: repeated keyword refreshes searched_at (dedupe per user+keyword). */
  async upsertRecent(userId: number, keyword: string, executor: Executor = db): Promise<void> {
    await executor
      .insert(recentSearch)
      .values({ userId, keyword })
      .onConflictDoUpdate({
        target: [recentSearch.userId, recentSearch.keyword],
        set: { searchedAt: new Date() },
      });
  }

  async listRecent(userId: number, limit: number, executor: Executor = db) {
    return executor
      .select({ keyword: recentSearch.keyword, searchedAt: recentSearch.searchedAt })
      .from(recentSearch)
      .where(eq(recentSearch.userId, userId))
      .orderBy(desc(recentSearch.searchedAt))
      .limit(limit);
  }

  async deleteRecent(userId: number, keyword: string, executor: Executor = db): Promise<void> {
    await executor
      .delete(recentSearch)
      .where(and(eq(recentSearch.userId, userId), eq(recentSearch.keyword, keyword)));
  }

  /**
   * Resolve a detected ingredient (image search) to a DB row — tries each
   * candidate name with an exact case-insensitive match first, then substring.
   */
  async findIngredientByAnyName(
    candidates: string[],
    executor: Executor = db,
  ): Promise<{ ingredientId: number; name: string } | null> {
    for (const name of candidates.map((c) => c.trim()).filter(Boolean)) {
      const exact = await executor
        .select({ ingredientId: ingredient.ingredientId, name: ingredient.name })
        .from(ingredient)
        .where(sql`lower(${ingredient.name}) = lower(${name})`)
        .limit(1);
      if (exact[0]) return exact[0];
      const partial = await executor
        .select({ ingredientId: ingredient.ingredientId, name: ingredient.name })
        .from(ingredient)
        .where(ilike(ingredient.name, `%${name}%`))
        .limit(1);
      if (partial[0]) return partial[0];
    }
    return null;
  }

  /** Same resolution strategy for detected equipment — active entries only (ADR-003). */
  async findEquipmentByAnyName(
    candidates: string[],
    executor: Executor = db,
  ): Promise<{ equipmentId: number; name: string } | null> {
    for (const name of candidates.map((c) => c.trim()).filter(Boolean)) {
      const exact = await executor
        .select({ equipmentId: masterEquipment.equipmentId, name: masterEquipment.name })
        .from(masterEquipment)
        .where(
          and(eq(masterEquipment.isActive, true), sql`lower(${masterEquipment.name}) = lower(${name})`),
        )
        .limit(1);
      if (exact[0]) return exact[0];
      const partial = await executor
        .select({ equipmentId: masterEquipment.equipmentId, name: masterEquipment.name })
        .from(masterEquipment)
        .where(and(eq(masterEquipment.isActive, true), ilike(masterEquipment.name, `%${name}%`)))
        .limit(1);
      if (partial[0]) return partial[0];
    }
    return null;
  }

  // ===== autocomplete (prefix ILIKE) =====

  async autocompleteIngredients(q: string, limit: number, executor: Executor = db) {
    return executor
      .select({ ingredientId: ingredient.ingredientId, name: ingredient.name })
      .from(ingredient)
      .where(ilike(ingredient.name, `${q}%`))
      .orderBy(asc(ingredient.name))
      .limit(limit);
  }

  async autocompleteUnits(q: string, limit: number, executor: Executor = db) {
    return executor
      .select({ unitId: unit.unitId, name: unit.name })
      .from(unit)
      .where(ilike(unit.name, `${q}%`))
      .orderBy(asc(unit.name))
      .limit(limit);
  }
}

export const searchRepository = new SearchRepository();
