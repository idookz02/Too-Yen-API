import {
  recipesRepository,
  type CardRow,
  type Completeness,
  type RecipesRepository,
} from "../repositories/recipes.repository";
import {
  BUCKETS,
  buildObjectPath,
  storageService,
  type StorageService,
} from "../../../shared/services/storage.service";
import { mapRecipeCard } from "./recipe-card";
import { badRequest, conflict, forbidden, notFound } from "../../../shared/utils/errors";
import { parsePagination, paginated } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import type {
  AddMediaInput,
  RecipeSort,
  UpsertRecipeInput,
  VisibilityInput,
} from "../dto/recipes.dto";

/** Publish checklist (AC M2-1) — names reported in INCOMPLETE_RECIPE details[]. */
const missingFields = (c: Completeness): string[] => {
  const missing: string[] = [];
  if (!c.row.recipeName) missing.push("recipe_name");
  if (!c.row.description) missing.push("description");
  if (c.row.skillLevelId == null) missing.push("skill_level");
  if (c.row.cookingMethodId == null) missing.push("cooking_method");
  if (c.row.cookTimeMinutes == null) missing.push("cook_time_minutes");
  if (c.row.categoryId == null) missing.push("category");
  if (c.equipmentCount < 1) missing.push("equipment");
  if (c.ingredientCount < 1) missing.push("ingredients");
  if (c.stepCount < 1) missing.push("steps");
  if (!c.hasCover) missing.push("cover_image");
  return missing;
};

export type RecipesServiceDeps = {
  repo?: RecipesRepository;
  storage?: Pick<StorageService, "upload" | "remove" | "publicUrl">;
};

export class RecipesService {
  private readonly repo: RecipesRepository;
  private readonly storage: NonNullable<RecipesServiceDeps["storage"]>;

  constructor(deps: RecipesServiceDeps = {}) {
    this.repo = deps.repo ?? recipesRepository;
    this.storage = deps.storage ?? storageService;
  }

  // GET /recipes — published feed
  async getFeed(
    query: { sort?: RecipeSort; page?: number; limit?: number },
    user: CurrentUser,
  ) {
    const { page, limit, offset } = parsePagination(query);
    const sort = query.sort ?? "newest";
    const [rows, total] = await Promise.all([
      this.repo.listPublishedCards({ sort, limit, offset }, user.userId),
      this.repo.countPublished(),
    ]);
    return paginated(rows.map((r) => this.mapCard(r, user)), page, limit, total);
  }

  // GET /recipes/{id}
  async getDetail(recipeId: number, user: CurrentUser) {
    const card = await this.repo.findCardById(recipeId, user.userId);
    if (!card) throw notFound("Recipe not found", "RECIPE_NOT_FOUND");
    if (card.status !== "published" && card.authorId !== user.userId) {
      throw forbidden("Draft/private recipes are visible to the owner only", "FORBIDDEN");
    }
    return this.buildDetail(card, user);
  }

  // POST /recipes — always a draft (AC M1-5: partial fields allowed)
  async create(input: UpsertRecipeInput, user: CurrentUser) {
    this.assertUniqueStepNumbers(input.steps);
    const recipeId = await this.repo.transaction(async (tx) => {
      const created = await this.repo.insertRecipe(
        {
          userId: user.userId,
          recipeName: input.recipe_name ?? null,
          description: input.description ?? null,
          skillLevelId: input.skill_level_id ?? null,
          cookTimeMinutes: input.cook_time_minutes ?? null,
          cookingMethodId: input.cooking_method_id ?? null,
          categoryId: input.category_id ?? null,
          status: "draft",
        },
        tx,
      );
      if (input.equipment_ids) {
        await this.repo.replaceEquipment(created.recipeId, input.equipment_ids, tx);
      }
      if (input.ingredients) {
        await this.repo.replaceIngredients(created.recipeId, input.ingredients, tx);
      }
      if (input.steps) await this.repo.replaceSteps(created.recipeId, input.steps, tx);
      return created.recipeId;
    });
    return this.getDetail(recipeId, user);
  }

  // PATCH /recipes/{id} — partial update; array fields replace the whole set
  async update(recipeId: number, input: UpsertRecipeInput, user: CurrentUser) {
    this.assertUniqueStepNumbers(input.steps);
    const current = await this.requireOwned(recipeId, user);

    // integrity guard (decision 2026-07-10): a published post must stay complete
    if (current.row.status === "published") {
      const after: Completeness = {
        row: {
          ...current.row,
          recipeName: input.recipe_name ?? current.row.recipeName,
          description: input.description ?? current.row.description,
          skillLevelId: input.skill_level_id ?? current.row.skillLevelId,
          cookTimeMinutes: input.cook_time_minutes ?? current.row.cookTimeMinutes,
          cookingMethodId: input.cooking_method_id ?? current.row.cookingMethodId,
          categoryId: input.category_id ?? current.row.categoryId,
        },
        equipmentCount: input.equipment_ids?.length ?? current.equipmentCount,
        ingredientCount: input.ingredients?.length ?? current.ingredientCount,
        stepCount: input.steps?.length ?? current.stepCount,
        hasCover: current.hasCover,
      };
      const missing = missingFields(after);
      if (missing.length > 0) {
        throw badRequest(
          "Update would leave a published recipe incomplete",
          "INCOMPLETE_RECIPE",
          missing,
        );
      }
    }

    const orphanedStepImages = await this.repo.transaction(async (tx) => {
      await this.repo.updateRecipe(
        recipeId,
        {
          ...(input.recipe_name !== undefined && { recipeName: input.recipe_name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.skill_level_id !== undefined && { skillLevelId: input.skill_level_id }),
          ...(input.cook_time_minutes !== undefined && { cookTimeMinutes: input.cook_time_minutes }),
          ...(input.cooking_method_id !== undefined && { cookingMethodId: input.cooking_method_id }),
          ...(input.category_id !== undefined && { categoryId: input.category_id }),
        },
        tx,
      );
      if (input.equipment_ids) {
        await this.repo.replaceEquipment(recipeId, input.equipment_ids, tx);
      }
      if (input.ingredients) {
        await this.repo.replaceIngredients(recipeId, input.ingredients, tx);
      }
      return input.steps ? this.repo.replaceSteps(recipeId, input.steps, tx) : [];
    });

    // files of steps that disappeared — remove after commit (ADR-009)
    await this.storage.remove(BUCKETS.recipeMedia, orphanedStepImages);
    return this.getDetail(recipeId, user);
  }

  // POST /recipes/{id}/publish — draft only (decision 2026-07-10)
  async publish(recipeId: number, user: CurrentUser) {
    const c = await this.requireOwned(recipeId, user);
    if (c.row.status !== "draft") {
      throw badRequest(
        `Only a draft can be published (current status: ${c.row.status}) — use /visibility for private↔published`,
        "INVALID_STATUS",
      );
    }
    const missing = missingFields(c);
    if (missing.length > 0) {
      throw badRequest("Recipe is incomplete", "INCOMPLETE_RECIPE", missing);
    }
    await this.repo.updateRecipe(recipeId, { status: "published", publishedAt: new Date() });
    return this.getDetail(recipeId, user);
  }

  // PATCH /recipes/{id}/visibility — published ↔ private only (AC M3)
  async setVisibility(recipeId: number, input: VisibilityInput, user: CurrentUser) {
    const c = await this.requireOwned(recipeId, user);
    if (c.row.status === "draft") {
      throw badRequest("A draft must go through /publish first", "INVALID_STATUS");
    }
    if (input.status === "published" && c.row.status === "private") {
      const missing = missingFields(c);
      if (missing.length > 0) {
        throw badRequest("Recipe is incomplete", "INCOMPLETE_RECIPE", missing);
      }
    }
    await this.repo.updateRecipe(recipeId, {
      status: input.status,
      // keep the original publish date on re-publish
      publishedAt: c.row.publishedAt ?? new Date(),
    });
    return this.getDetail(recipeId, user);
  }

  // DELETE /recipes/{id} — hard delete + storage cleanup (AC M3-7, ADR-009)
  async delete(recipeId: number, user: CurrentUser) {
    await this.requireOwned(recipeId, user);
    const paths = await this.repo.collectStoragePaths(recipeId);
    await this.repo.deleteRecipe(recipeId); // DB cascade removes children
    await this.storage.remove(BUCKETS.recipeMedia, paths.recipeMedia);
    await this.storage.remove(BUCKETS.commentImages, paths.commentImages);
  }

  // POST /recipes/{id}/media
  async addMedia(recipeId: number, input: AddMediaInput, user: CurrentUser) {
    await this.requireOwned(recipeId, user);
    const isCover = input.is_cover === true || input.is_cover === "true";

    if (!input.file.type.startsWith(`${input.type}/`)) {
      throw badRequest(
        `File content type "${input.file.type}" does not match type=${input.type}`,
        "VALIDATION_ERROR",
      );
    }
    if (isCover && input.type === "video") {
      throw badRequest("The cover must be an image", "VALIDATION_ERROR");
    }
    if (input.type === "video" && (await this.repo.countVideos(recipeId)) >= 1) {
      throw conflict("A recipe can have at most one video", "VIDEO_LIMIT");
    }

    const path = await this.storage.upload(
      BUCKETS.recipeMedia,
      buildObjectPath(recipeId, input.file),
      input.file,
    );
    const created = await this.repo.transaction(async (tx) => {
      if (isCover) await this.repo.unsetCover(recipeId, tx); // new cover unsets old
      return this.repo.insertMedia(
        {
          recipeId,
          mediaType: input.type,
          bucket: BUCKETS.recipeMedia,
          objectPath: path,
          isCover,
          sortOrder: input.sort_order ?? 0,
        },
        tx,
      );
    });
    return {
      media_id: created.mediaId,
      type: created.mediaType,
      url: this.storage.publicUrl(BUCKETS.recipeMedia, created.objectPath),
      is_cover: created.isCover,
      sort_order: created.sortOrder,
    };
  }

  // DELETE /recipes/{id}/media/{media_id}
  async deleteMedia(recipeId: number, mediaId: number, user: CurrentUser) {
    const c = await this.requireOwned(recipeId, user);
    const media = await this.repo.findMedia(mediaId);
    if (!media || media.recipeId !== recipeId) {
      throw notFound("Media not found", "MEDIA_NOT_FOUND");
    }
    // integrity guard: removing the cover of a published post breaks completeness
    if (c.row.status === "published" && media.isCover) {
      throw badRequest(
        "Cannot remove the cover image of a published recipe",
        "INCOMPLETE_RECIPE",
        ["cover_image"],
      );
    }
    await this.repo.deleteMedia(mediaId);
    await this.storage.remove(BUCKETS.recipeMedia, [media.objectPath]);
  }

  // PUT /recipes/{id}/steps/{step_number}/image — one image per step, replaces existing
  async putStepImage(recipeId: number, stepNumber: number, file: File, user: CurrentUser) {
    await this.requireOwned(recipeId, user);
    const step = await this.repo.findStep(recipeId, stepNumber);
    if (!step) throw notFound("Step not found", "STEP_NOT_FOUND");

    const path = await this.storage.upload(
      BUCKETS.recipeMedia,
      buildObjectPath(recipeId, file),
      file,
    );
    await this.repo.updateStepImage(step.stepId, path);
    if (step.imagePath) await this.storage.remove(BUCKETS.recipeMedia, [step.imagePath]);
    return {
      step_number: stepNumber,
      image_url: this.storage.publicUrl(BUCKETS.recipeMedia, path),
    };
  }

  // ===== helpers =====

  /** 404 when missing, 403 when not the owner; returns completeness for guards. */
  private async requireOwned(recipeId: number, user: CurrentUser): Promise<Completeness> {
    const c = await this.repo.getCompleteness(recipeId);
    if (!c) throw notFound("Recipe not found", "RECIPE_NOT_FOUND");
    if (c.row.userId !== user.userId) {
      throw forbidden("Only the owner can modify this recipe", "FORBIDDEN");
    }
    return c;
  }

  private assertUniqueStepNumbers(steps?: { step_number: number }[]) {
    if (!steps) return;
    const numbers = steps.map((s) => s.step_number);
    if (new Set(numbers).size !== numbers.length) {
      throw badRequest("Duplicate step_number in steps", "VALIDATION_ERROR");
    }
  }

  private mapCard(row: CardRow, user: CurrentUser) {
    return mapRecipeCard(row, user.userId, (b, p) => this.storage.publicUrl(b, p));
  }

  private async buildDetail(card: CardRow, user: CurrentUser) {
    const parts = await this.repo.findDetailParts(card.recipeId);
    const row = await this.repo.findRow(card.recipeId);
    if (!row) throw notFound("Recipe not found", "RECIPE_NOT_FOUND");
    const m = parts.masters;
    return {
      ...this.mapCard(card, user),
      description: row.description,
      cook_time_minutes: row.cookTimeMinutes,
      skill_level:
        m?.skillLevelId != null ? { id: m.skillLevelId, name: m.skillLevelName! } : null,
      cooking_method:
        m?.cookingMethodId != null
          ? { id: m.cookingMethodId, name: m.cookingMethodName! }
          : null,
      category: m?.categoryId != null ? { id: m.categoryId, name: m.categoryName! } : null,
      equipment: parts.equipment,
      ingredients: parts.ingredients.map((i) => ({
        ingredient_id: i.ingredientId,
        name: i.name,
        amount: i.amount != null ? Number(i.amount) : null,
        unit: i.unitId != null ? { id: i.unitId, name: i.unitName! } : null,
        sort_order: i.sortOrder,
      })),
      steps: parts.steps.map((s) => ({
        step_number: s.stepNumber,
        instruction: s.instruction,
        image_url: s.imagePath
          ? this.storage.publicUrl(BUCKETS.recipeMedia, s.imagePath)
          : null,
      })),
      media: parts.media.map((mm) => ({
        media_id: mm.mediaId,
        type: mm.mediaType,
        url: this.storage.publicUrl(BUCKETS.recipeMedia, mm.objectPath),
        is_cover: mm.isCover,
        sort_order: mm.sortOrder,
      })),
    };
  }
}

export const recipesService = new RecipesService();
