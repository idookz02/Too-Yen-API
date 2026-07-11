import { and, asc, desc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import {
  ingredient,
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

/** All filters AND-combined (AC 4); published posts only. */
function buildConditions(filters: SearchFilters): SQL[] {
  const conditions: SQL[] = [eq(recipe.status, "published")];

  if (filters.q) {
    conditions.push(
      or(
        ilike(recipe.recipeName, `%${filters.q}%`),
        ilike(recipe.description, `%${filters.q}%`),
      )!,
    );
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
    opts: { sort: RecipeSort; limit: number; offset: number },
    currentUserId: number,
    executor: Executor = db,
  ): Promise<CardRow[]> {
    return executor
      .select(cardSelect(currentUserId))
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(and(...buildConditions(filters)))
      .orderBy(...SORT_ORDER[opts.sort])
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countSearch(filters: SearchFilters, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipe)
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
