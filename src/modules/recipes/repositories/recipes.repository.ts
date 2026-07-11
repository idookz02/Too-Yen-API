import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import {
  comment,
  cookingStep,
  ingredient,
  masterCategory,
  masterCookingMethod,
  masterEquipment,
  masterSkillLevel,
  masterTier,
  recipe,
  recipeEquipment,
  recipeFavorite,
  recipeIngredient,
  recipeLike,
  recipeMedia,
  unit,
  users,
} from "../../../db/schema";
import type { RecipeSort } from "../dto/recipes.dto";

export type RecipeRow = typeof recipe.$inferSelect;
export type MediaRow = typeof recipeMedia.$inferSelect;

export type CardRow = {
  recipeId: number;
  recipeName: string | null;
  status: string;
  publishedAt: Date | null;
  authorId: number;
  authorName: string;
  tierName: string | null;
  coverPath: string | null;
  likeCount: number;
  favoriteCount: number;
  commentCount: number;
  likedByMe: boolean;
  favoritedByMe: boolean;
};

export type IngredientInput = { name: string; amount?: number; unit_name?: string };
export type StepInput = { step_number: number; instruction: string };

/** Counts + field presence used by the publish/integrity checks. */
export type Completeness = {
  row: RecipeRow;
  equipmentCount: number;
  ingredientCount: number;
  stepCount: number;
  hasCover: boolean;
};

// correlated subqueries shared by feed/detail card selects
const likeCountSql = sql<number>`(select count(*) from ${recipeLike} rl where rl.recipe_id = ${recipe.recipeId})`.mapWith(Number);
const favoriteCountSql = sql<number>`(select count(*) from recipe_favorite rf where rf.recipe_id = ${recipe.recipeId})`.mapWith(Number);
const commentCountSql = sql<number>`(select count(*) from ${comment} c where c.recipe_id = ${recipe.recipeId} and c.is_deleted = false)`.mapWith(Number);
const coverPathSql = sql<string | null>`(select rm.object_path from ${recipeMedia} rm where rm.recipe_id = ${recipe.recipeId} and rm.is_cover limit 1)`;
const likedByMeSql = (userId: number) =>
  sql<boolean>`exists(select 1 from ${recipeLike} rl where rl.recipe_id = ${recipe.recipeId} and rl.user_id = ${userId})`;
const favoritedByMeSql = (userId: number) =>
  sql<boolean>`exists(select 1 from recipe_favorite rf where rf.recipe_id = ${recipe.recipeId} and rf.user_id = ${userId})`;

/** Shared card projection — also reused by the search module. */
export const cardSelect = (userId: number) => ({
  recipeId: recipe.recipeId,
  recipeName: recipe.recipeName,
  status: recipe.status,
  publishedAt: recipe.publishedAt,
  authorId: users.userId,
  authorName: users.displayName,
  tierName: masterTier.name,
  coverPath: coverPathSql,
  likeCount: likeCountSql,
  favoriteCount: favoriteCountSql,
  commentCount: commentCountSql,
  likedByMe: likedByMeSql(userId),
  favoritedByMe: favoritedByMeSql(userId),
});

export const SORT_ORDER: Record<RecipeSort, SQL[]> = {
  newest: [desc(recipe.publishedAt)],
  most_liked: [desc(likeCountSql), desc(recipe.publishedAt)],
  most_favorited: [desc(favoriteCountSql), desc(recipe.publishedAt)],
};

export class RecipesRepository {
  /** Run repo calls inside one transaction (repositories accept the tx as Executor). */
  async transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    return db.transaction((tx) => fn(tx));
  }

  // ===== cards =====

  async listPublishedCards(
    opts: { sort: RecipeSort; limit: number; offset: number },
    currentUserId: number,
    executor: Executor = db,
  ): Promise<CardRow[]> {
    return executor
      .select(cardSelect(currentUserId))
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(eq(recipe.status, "published"))
      .orderBy(...SORT_ORDER[opts.sort])
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countPublished(executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipe)
      .where(eq(recipe.status, "published"));
    return row?.total ?? 0;
  }

  /** Saved list: favorited posts, latest save first; others' private/draft filtered out (ADR-005). */
  async listFavoritedCards(
    userId: number,
    opts: { limit: number; offset: number },
    executor: Executor = db,
  ): Promise<CardRow[]> {
    return executor
      .select(cardSelect(userId))
      .from(recipeFavorite)
      .innerJoin(recipe, eq(recipeFavorite.recipeId, recipe.recipeId))
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(
        and(
          eq(recipeFavorite.userId, userId),
          or(eq(recipe.status, "published"), eq(recipe.userId, userId)),
        ),
      )
      .orderBy(desc(recipeFavorite.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countFavorited(userId: number, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipeFavorite)
      .innerJoin(recipe, eq(recipeFavorite.recipeId, recipe.recipeId))
      .where(
        and(
          eq(recipeFavorite.userId, userId),
          or(eq(recipe.status, "published"), eq(recipe.userId, userId)),
        ),
      );
    return row?.total ?? 0;
  }

  /** Profile lists: own recipes by status. Drafts sort by last edit, posts by publish date. */
  async listOwnCards(
    userId: number,
    statuses: string[],
    orderBy: "updated" | "published",
    opts: { limit: number; offset: number },
    executor: Executor = db,
  ): Promise<CardRow[]> {
    return executor
      .select(cardSelect(userId))
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(and(eq(recipe.userId, userId), inArray(recipe.status, statuses)))
      .orderBy(orderBy === "updated" ? desc(recipe.updatedAt) : desc(recipe.publishedAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async countOwn(
    userId: number,
    statuses: string[],
    executor: Executor = db,
  ): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipe)
      .where(and(eq(recipe.userId, userId), inArray(recipe.status, statuses)));
    return row?.total ?? 0;
  }

  async findCardById(
    recipeId: number,
    currentUserId: number,
    executor: Executor = db,
  ): Promise<CardRow | null> {
    const [row] = await executor
      .select(cardSelect(currentUserId))
      .from(recipe)
      .innerJoin(users, eq(recipe.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(eq(recipe.recipeId, recipeId))
      .limit(1);
    return row ?? null;
  }

  // ===== rows & detail parts =====

  async findRow(recipeId: number, executor: Executor = db): Promise<RecipeRow | null> {
    const [row] = await executor
      .select()
      .from(recipe)
      .where(eq(recipe.recipeId, recipeId))
      .limit(1);
    return row ?? null;
  }

  async findDetailParts(recipeId: number, executor: Executor = db) {
    const [masters] = await executor
      .select({
        skillLevelId: masterSkillLevel.skillLevelId,
        skillLevelName: masterSkillLevel.name,
        cookingMethodId: masterCookingMethod.cookingMethodId,
        cookingMethodName: masterCookingMethod.name,
        categoryId: masterCategory.categoryId,
        categoryName: masterCategory.name,
      })
      .from(recipe)
      .leftJoin(masterSkillLevel, eq(recipe.skillLevelId, masterSkillLevel.skillLevelId))
      .leftJoin(masterCookingMethod, eq(recipe.cookingMethodId, masterCookingMethod.cookingMethodId))
      .leftJoin(masterCategory, eq(recipe.categoryId, masterCategory.categoryId))
      .where(eq(recipe.recipeId, recipeId))
      .limit(1);

    const equipment = await executor
      .select({ id: masterEquipment.equipmentId, name: masterEquipment.name })
      .from(recipeEquipment)
      .innerJoin(masterEquipment, eq(recipeEquipment.equipmentId, masterEquipment.equipmentId))
      .where(eq(recipeEquipment.recipeId, recipeId))
      .orderBy(asc(masterEquipment.name));

    const ingredients = await executor
      .select({
        ingredientId: recipeIngredient.ingredientId,
        name: ingredient.name,
        amount: recipeIngredient.amount,
        unitId: unit.unitId,
        unitName: unit.name,
        sortOrder: recipeIngredient.sortOrder,
      })
      .from(recipeIngredient)
      .innerJoin(ingredient, eq(recipeIngredient.ingredientId, ingredient.ingredientId))
      .leftJoin(unit, eq(recipeIngredient.unitId, unit.unitId))
      .where(eq(recipeIngredient.recipeId, recipeId))
      .orderBy(asc(recipeIngredient.sortOrder));

    const steps = await executor
      .select({
        stepNumber: cookingStep.stepNumber,
        instruction: cookingStep.instruction,
        imagePath: cookingStep.imagePath,
      })
      .from(cookingStep)
      .where(eq(cookingStep.recipeId, recipeId))
      .orderBy(asc(cookingStep.stepNumber));

    const media = await executor
      .select()
      .from(recipeMedia)
      .where(eq(recipeMedia.recipeId, recipeId))
      .orderBy(asc(recipeMedia.sortOrder), asc(recipeMedia.mediaId));

    return { masters: masters ?? null, equipment, ingredients, steps, media };
  }

  // ===== create / update =====

  async insertRecipe(
    input: typeof recipe.$inferInsert,
    executor: Executor = db,
  ): Promise<RecipeRow> {
    const [created] = await executor.insert(recipe).values(input).returning();
    if (!created) throw new Error("insertRecipe returned no row");
    return created;
  }

  async updateRecipe(
    recipeId: number,
    patch: Partial<typeof recipe.$inferInsert>,
    executor: Executor = db,
  ): Promise<void> {
    await executor
      .update(recipe)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(recipe.recipeId, recipeId));
  }

  /** find-or-create by lower(name) — ADR-001. Race-safe via ON CONFLICT DO NOTHING + re-read. */
  private async findOrCreateIngredient(name: string, executor: Executor): Promise<number> {
    const byName = () =>
      executor
        .select({ id: ingredient.ingredientId })
        .from(ingredient)
        .where(sql`lower(${ingredient.name}) = lower(${name})`)
        .limit(1);
    const [existing] = await byName();
    if (existing) return existing.id;
    const [inserted] = await executor
      .insert(ingredient)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: ingredient.ingredientId });
    if (inserted) return inserted.id;
    const [again] = await byName();
    if (!again) throw new Error(`findOrCreateIngredient failed for "${name}"`);
    return again.id;
  }

  /** find-or-create by lower(name) — ADR-007. */
  private async findOrCreateUnit(name: string, executor: Executor): Promise<number> {
    const byName = () =>
      executor
        .select({ id: unit.unitId })
        .from(unit)
        .where(sql`lower(${unit.name}) = lower(${name})`)
        .limit(1);
    const [existing] = await byName();
    if (existing) return existing.id;
    const [inserted] = await executor
      .insert(unit)
      .values({ name })
      .onConflictDoNothing()
      .returning({ id: unit.unitId });
    if (inserted) return inserted.id;
    const [again] = await byName();
    if (!again) throw new Error(`findOrCreateUnit failed for "${name}"`);
    return again.id;
  }

  /** Replace the whole ingredient set (doc: replace-set semantics). */
  async replaceIngredients(
    recipeId: number,
    items: IngredientInput[],
    executor: Executor = db,
  ): Promise<void> {
    await executor.delete(recipeIngredient).where(eq(recipeIngredient.recipeId, recipeId));
    const seen = new Set<number>();
    let sortOrder = 0;
    for (const item of items) {
      const ingredientId = await this.findOrCreateIngredient(item.name, executor);
      if (seen.has(ingredientId)) continue; // dedupe within one payload (PK recipe+ingredient)
      seen.add(ingredientId);
      sortOrder += 1;
      await executor.insert(recipeIngredient).values({
        recipeId,
        ingredientId,
        amount: item.amount != null ? String(item.amount) : null,
        unitId: item.unit_name ? await this.findOrCreateUnit(item.unit_name, executor) : null,
        sortOrder,
      });
    }
  }

  /**
   * Replace the whole step set. Existing step images are preserved by
   * step_number; returns storage paths of images whose steps were removed
   * (caller deletes the files after commit).
   */
  async replaceSteps(
    recipeId: number,
    steps: StepInput[],
    executor: Executor = db,
  ): Promise<string[]> {
    const existing = await executor
      .select({ stepNumber: cookingStep.stepNumber, imagePath: cookingStep.imagePath })
      .from(cookingStep)
      .where(eq(cookingStep.recipeId, recipeId));
    const imageByStep = new Map(existing.map((s) => [s.stepNumber, s.imagePath]));

    await executor.delete(cookingStep).where(eq(cookingStep.recipeId, recipeId));
    for (const s of steps) {
      await executor.insert(cookingStep).values({
        recipeId,
        stepNumber: s.step_number,
        instruction: s.instruction,
        imagePath: imageByStep.get(s.step_number) ?? null,
      });
    }

    const kept = new Set(steps.map((s) => s.step_number));
    return existing
      .filter((s) => !kept.has(s.stepNumber) && s.imagePath != null)
      .map((s) => s.imagePath as string);
  }

  async replaceEquipment(
    recipeId: number,
    equipmentIds: number[],
    executor: Executor = db,
  ): Promise<void> {
    await executor.delete(recipeEquipment).where(eq(recipeEquipment.recipeId, recipeId));
    const unique = [...new Set(equipmentIds)];
    if (unique.length > 0) {
      await executor
        .insert(recipeEquipment)
        .values(unique.map((equipmentId) => ({ recipeId, equipmentId })));
    }
  }

  // ===== completeness (publish + integrity guards) =====

  async getCompleteness(recipeId: number, executor: Executor = db): Promise<Completeness | null> {
    const row = await this.findRow(recipeId, executor);
    if (!row) return null;
    const [counts] = await executor
      .select({
        equipmentCount: sql<number>`(select count(*) from ${recipeEquipment} re where re.recipe_id = ${recipeId})`.mapWith(Number),
        ingredientCount: sql<number>`(select count(*) from ${recipeIngredient} ri where ri.recipe_id = ${recipeId})`.mapWith(Number),
        stepCount: sql<number>`(select count(*) from ${cookingStep} cs where cs.recipe_id = ${recipeId})`.mapWith(Number),
        hasCover: sql<boolean>`exists(select 1 from ${recipeMedia} rm where rm.recipe_id = ${recipeId} and rm.is_cover)`,
      })
      .from(sql`(select 1) as one`);
    return { row, ...counts! };
  }

  // ===== delete =====

  /** Storage paths to remove after the row cascade (ADR-009 cleanup). */
  async collectStoragePaths(recipeId: number, executor: Executor = db) {
    const media = await executor
      .select({ objectPath: recipeMedia.objectPath })
      .from(recipeMedia)
      .where(eq(recipeMedia.recipeId, recipeId));
    const steps = await executor
      .select({ imagePath: cookingStep.imagePath })
      .from(cookingStep)
      .where(eq(cookingStep.recipeId, recipeId));
    const comments = await executor
      .select({ imagePath: comment.imagePath })
      .from(comment)
      .where(eq(comment.recipeId, recipeId));
    return {
      recipeMedia: [
        ...media.map((m) => m.objectPath),
        ...steps.flatMap((s) => (s.imagePath ? [s.imagePath] : [])),
      ],
      commentImages: comments.flatMap((c) => (c.imagePath ? [c.imagePath] : [])),
    };
  }

  async deleteRecipe(recipeId: number, executor: Executor = db): Promise<void> {
    await executor.delete(recipe).where(eq(recipe.recipeId, recipeId));
  }

  // ===== media =====

  async countVideos(recipeId: number, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipeMedia)
      .where(and(eq(recipeMedia.recipeId, recipeId), eq(recipeMedia.mediaType, "video")));
    return row?.total ?? 0;
  }

  async unsetCover(recipeId: number, executor: Executor = db): Promise<void> {
    await executor
      .update(recipeMedia)
      .set({ isCover: false })
      .where(and(eq(recipeMedia.recipeId, recipeId), eq(recipeMedia.isCover, true)));
  }

  async insertMedia(
    input: typeof recipeMedia.$inferInsert,
    executor: Executor = db,
  ): Promise<MediaRow> {
    const [created] = await executor.insert(recipeMedia).values(input).returning();
    if (!created) throw new Error("insertMedia returned no row");
    return created;
  }

  async findMedia(mediaId: number, executor: Executor = db): Promise<MediaRow | null> {
    const [row] = await executor
      .select()
      .from(recipeMedia)
      .where(eq(recipeMedia.mediaId, mediaId))
      .limit(1);
    return row ?? null;
  }

  async deleteMedia(mediaId: number, executor: Executor = db): Promise<void> {
    await executor.delete(recipeMedia).where(eq(recipeMedia.mediaId, mediaId));
  }

  // ===== step image =====

  async findStep(recipeId: number, stepNumber: number, executor: Executor = db) {
    const [row] = await executor
      .select()
      .from(cookingStep)
      .where(and(eq(cookingStep.recipeId, recipeId), eq(cookingStep.stepNumber, stepNumber)))
      .limit(1);
    return row ?? null;
  }

  async updateStepImage(
    stepId: number,
    imagePath: string,
    executor: Executor = db,
  ): Promise<void> {
    await executor
      .update(cookingStep)
      .set({ imagePath })
      .where(eq(cookingStep.stepId, stepId));
  }
}

export const recipesRepository = new RecipesRepository();
