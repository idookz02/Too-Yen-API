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
import {
  mediaProcessingService,
  type MediaProcessingService,
} from "../../../shared/services/media-processing.service";
import { mapRecipeCard } from "./recipe-card";
import { badRequest, conflict, forbidden, notFound } from "../../../shared/utils/errors";
import { parsePagination, paginated } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import { Value } from "@sinclair/typebox/value";
import {
  UpsertRecipeDTO,
  type AddMediaInput,
  type MediaType,
  type RecipeSort,
  type UpsertRecipeInput,
  type VisibilityInput,
} from "../dto/recipes.dto";

/** Publish checklist (AC M2-1) — names reported in INCOMPLETE_RECIPE details[]. */
const missingFields = (c: Completeness): string[] => {
  const missing: string[] = [];
  if (!c.row.recipeName) missing.push("recipe_name");
  // description is optional (no longer gated at publish)
  if (c.row.skillLevelId == null) missing.push("skill_level");
  if (c.cookingMethodCount < 1) missing.push("cooking_method");
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
  media?: Pick<MediaProcessingService, "processImage" | "processVideo">;
};

export class RecipesService {
  private readonly repo: RecipesRepository;
  private readonly storage: NonNullable<RecipesServiceDeps["storage"]>;
  private readonly media: NonNullable<RecipesServiceDeps["media"]>;

  constructor(deps: RecipesServiceDeps = {}) {
    this.repo = deps.repo ?? recipesRepository;
    this.storage = deps.storage ?? storageService;
    this.media = deps.media ?? mediaProcessingService;
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

  /**
   * POST /recipes (multipart, decision 2026-07-10) — create + images (+ publish)
   * in ONE request. All-or-nothing: any failed upload or a failed
   * publish-validation deletes the recipe and every file already uploaded.
   */
  async createFromMultipart(body: Record<string, unknown>, user: CurrentUser) {
    const { input, cover, video, stepImages, publish } = this.parseRecipeMultipart(body);

    const created = await this.create(input, user);
    const recipeId = created.recipe_id;
    try {
      if (cover) {
        await this.addMedia(recipeId, { file: cover, type: "image", is_cover: true }, user);
      }
      if (video) {
        await this.addMedia(recipeId, { file: video, type: "video" }, user);
      }
      for (const [stepNumber, file] of stepImages) {
        await this.putStepImage(recipeId, stepNumber, file, user);
      }
      if (publish) return await this.publish(recipeId, user);
      return await this.getDetail(recipeId, user);
    } catch (e) {
      // compensating cleanup — delete() collects storage paths and cascades
      await this.delete(recipeId, user).catch((cleanupErr) => {
        console.error(`[recipes] rollback of recipe ${recipeId} failed:`, cleanupErr);
      });
      throw e;
    }
  }

  /**
   * PATCH /recipes/{id} (multipart) — data + images in one request. The data
   * update commits first; a failed image upload afterwards errors out but the
   * data change stands (retry the image via PUT /steps/{n}/image).
   */
  async updateFromMultipart(recipeId: number, body: Record<string, unknown>, user: CurrentUser) {
    const { input, cover, video, stepImages, publish } = this.parseRecipeMultipart(body);
    if (publish) {
      throw badRequest(
        "publish is only supported when creating — use POST /recipes/{id}/publish",
        "VALIDATION_ERROR",
      );
    }
    await this.update(recipeId, input, user);
    if (cover) {
      await this.addMedia(recipeId, { file: cover, type: "image", is_cover: true }, user);
    }
    if (video) {
      // one video per recipe (VIDEO_LIMIT) — replace: drop the old (row + file)
      // before uploading the new one, mirroring how cover swaps in-place
      const existing = await this.repo.findVideo(recipeId);
      if (existing) await this.deleteMedia(recipeId, existing.mediaId, user);
      await this.addMedia(recipeId, { file: video, type: "video" }, user);
    }
    for (const [stepNumber, file] of stepImages) {
      await this.putStepImage(recipeId, stepNumber, file, user);
    }
    return this.getDetail(recipeId, user);
  }

  /** Parse + validate the multipart body: data JSON, cover, video, per-step
   *  image parts (resolved via each step's image_field), publish. */
  private parseRecipeMultipart(body: Record<string, unknown>): {
    input: UpsertRecipeInput;
    cover?: File;
    video?: File;
    stepImages: Map<number, File>;
    publish: boolean;
  } {
    // Elysia may hand us either the auto-parsed object (JSON-looking form
    // value) or the raw string — normalize both paths through the same check
    let input: UpsertRecipeInput = {};
    const raw = body.data;
    if (raw !== undefined && raw !== null && raw !== "") {
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw badRequest("data must be a valid JSON string", "VALIDATION_ERROR");
        }
      }
      if (!Value.Check(UpsertRecipeDTO, parsed)) {
        const first = Value.Errors(UpsertRecipeDTO, parsed).First();
        throw badRequest(
          `Invalid data${first ? `: ${first.path} ${first.message}` : ""}`,
          "VALIDATION_ERROR",
        );
      }
      input = parsed;
    }

    // Each step names its image via `image_field` = a multipart file part.
    // Resolve here so createFromMultipart's all-or-nothing contract can reject a
    // missing/invalid/reserved field BEFORE any DB or storage write.
    const RESERVED = new Set(["data", "cover", "video", "publish"]);
    const stepImages = new Map<number, File>();
    for (const step of input.steps ?? []) {
      const field = step.image_field;
      if (field == null) continue;
      if (RESERVED.has(field)) {
        throw badRequest(
          `step_number ${step.step_number}: image_field "${field}" is a reserved field name`,
          "VALIDATION_ERROR",
        );
      }
      const value = body[field];
      if (!(value instanceof File) || !value.type.startsWith("image/")) {
        throw badRequest(
          `step_number ${step.step_number}: image_field "${field}" must reference an uploaded image file part`,
          "VALIDATION_ERROR",
        );
      }
      stepImages.set(step.step_number, value);
    }

    return {
      input,
      cover: body.cover instanceof File ? body.cover : undefined,
      video: body.video instanceof File ? body.video : undefined,
      stepImages,
      publish: body.publish === true || body.publish === "true",
    };
  }

  // POST /recipes — always a draft (AC M1-5: partial fields allowed)
  async create(input: UpsertRecipeInput, user: CurrentUser) {
    this.assertIngredientRefs(input.ingredients);
    this.assertEquipmentRefs(input.equipment);
    this.assertUniqueStepNumbers(input.steps);
    const recipeId = await this.repo.transaction(async (tx) => {
      const created = await this.repo.insertRecipe(
        {
          userId: user.userId,
          recipeName: input.recipe_name ?? null,
          description: input.description ?? null,
          skillLevelId: input.skill_level_id ?? null,
          cookTimeMinutes: input.cook_time_minutes ?? null,
          servings: input.servings ?? null,
          categoryId: input.category_id ?? null,
          status: "draft",
        },
        tx,
      );
      if (input.cooking_method_ids) {
        await this.repo.replaceCookingMethods(created.recipeId, input.cooking_method_ids, tx);
      }
      if (input.equipment) {
        await this.repo.replaceEquipment(created.recipeId, input.equipment, tx);
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
    this.assertIngredientRefs(input.ingredients);
    this.assertEquipmentRefs(input.equipment);
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
          categoryId: input.category_id ?? current.row.categoryId,
        },
        equipmentCount: input.equipment?.length ?? current.equipmentCount,
        cookingMethodCount: input.cooking_method_ids?.length ?? current.cookingMethodCount,
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
          ...(input.servings !== undefined && { servings: input.servings }),
          ...(input.category_id !== undefined && { categoryId: input.category_id }),
        },
        tx,
      );
      if (input.cooking_method_ids) {
        await this.repo.replaceCookingMethods(recipeId, input.cooking_method_ids, tx);
      }
      if (input.equipment) {
        await this.repo.replaceEquipment(recipeId, input.equipment, tx);
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

    // compress before storing (decision 2026-07-10): images → WebP preset,
    // videos → 720p H.264 when ffmpeg is available
    const processed =
      input.type === "image"
        ? await this.media.processImage(input.file, "recipeMedia")
        : await this.media.processVideo(input.file);
    const path = await this.storage.upload(
      BUCKETS.recipeMedia,
      buildObjectPath(recipeId, processed),
      processed,
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
      type: created.mediaType as MediaType,
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

    const processed = await this.media.processImage(file, "stepImage");
    const path = await this.storage.upload(
      BUCKETS.recipeMedia,
      buildObjectPath(recipeId, processed),
      processed,
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

  /** Each ingredient must carry an ingredient_id (dropdown) or a name (new). */
  private assertIngredientRefs(ingredients?: UpsertRecipeInput["ingredients"]) {
    if (!ingredients) return;
    for (const i of ingredients) {
      if (i.ingredient_id == null && !i.name) {
        throw badRequest("Each ingredient needs an ingredient_id or a name", "VALIDATION_ERROR");
      }
    }
  }

  /** Each equipment must carry an equipment_id (dropdown) or a name (new). */
  private assertEquipmentRefs(equipment?: UpsertRecipeInput["equipment"]) {
    if (!equipment) return;
    for (const e of equipment) {
      if (e.equipment_id == null && !e.name) {
        throw badRequest("Each equipment needs an equipment_id or a name", "VALIDATION_ERROR");
      }
    }
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
      servings: row.servings,
      skill_level:
        m?.skillLevelId != null ? { id: m.skillLevelId, name: m.skillLevelName! } : null,
      cooking_methods: parts.cookingMethods,
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
        // DB column is plain `text` (check constraint, not a real enum) — see MediaType.
        type: mm.mediaType as MediaType,
        url: this.storage.publicUrl(BUCKETS.recipeMedia, mm.objectPath),
        is_cover: mm.isCover,
        sort_order: mm.sortOrder,
      })),
    };
  }
}

export const recipesService = new RecipesService();
