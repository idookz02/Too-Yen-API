/**
 * RecipesService unit tests with an in-memory mock repository (test-strategy
 * decision 2026-07-10). Covers the Step-4 checklist: publish validation
 * matrix, ownership guards, integrity guards on published posts, media rules,
 * delete/storage cleanup.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { RecipesService } from "../src/modules/recipes/services/recipes.service";
import { AppError } from "../src/shared/utils/errors";
import type {
  CardRow,
  MediaRow,
  RecipeRow,
  RecipesRepository,
} from "../src/modules/recipes/repositories/recipes.repository";

// ===== in-memory state =====

type StepRec = { step_number: number; instruction: string; imagePath: string | null };

type State = {
  recipes: Map<number, RecipeRow>;
  equipment: Map<number, number[]>;
  ingredients: Map<number, { name: string }[]>;
  steps: Map<number, StepRec[]>;
  media: Map<number, MediaRow[]>;
  commentImagePaths: Map<number, string[]>;
  removed: { bucket: string; paths: string[] }[];
  nextMediaId: number;
};

const emptyState = (): State => ({
  recipes: new Map(),
  equipment: new Map(),
  ingredients: new Map(),
  steps: new Map(),
  media: new Map(),
  commentImagePaths: new Map(),
  removed: [],
  nextMediaId: 1,
});

const makeRow = (over: Partial<RecipeRow> = {}): RecipeRow => ({
  recipeId: 1,
  userId: 1,
  recipeName: "Tom Yum Goong",
  description: "desc",
  skillLevelId: 1,
  cookTimeMinutes: 30,
  cookingMethodId: 2,
  categoryId: 3,
  status: "draft",
  publishedAt: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  ...over,
});

/** Seed a recipe that passes the whole publish checklist (unless overridden). */
function seedComplete(state: State, over: Partial<RecipeRow> = {}) {
  const row = makeRow(over);
  state.recipes.set(row.recipeId, row);
  state.equipment.set(row.recipeId, [1]);
  state.ingredients.set(row.recipeId, [{ name: "Shrimp" }]);
  state.steps.set(row.recipeId, [
    { step_number: 1, instruction: "Boil", imagePath: null },
  ]);
  state.media.set(row.recipeId, [
    {
      mediaId: state.nextMediaId++,
      recipeId: row.recipeId,
      mediaType: "image",
      bucket: "recipe-media",
      objectPath: `${row.recipeId}/cover.jpg`,
      isCover: true,
      sortOrder: 0,
      createdAt: new Date(),
    },
  ]);
  return row;
}

function makeRepo(state: State) {
  const cardOf = (row: RecipeRow, userId: number): CardRow => ({
    recipeId: row.recipeId,
    recipeName: row.recipeName,
    status: row.status,
    publishedAt: row.publishedAt,
    authorId: row.userId,
    authorName: `user-${row.userId}`,
    tierName: "Bronze",
    coverPath: state.media.get(row.recipeId)?.find((m) => m.isCover)?.objectPath ?? null,
    likeCount: 0,
    favoriteCount: 0,
    commentCount: 0,
    likedByMe: false,
    favoritedByMe: false,
  });

  const repo = {
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({}),
    listPublishedCards: async (_o: unknown, userId: number) =>
      [...state.recipes.values()]
        .filter((r) => r.status === "published")
        .map((r) => cardOf(r, userId)),
    countPublished: async () =>
      [...state.recipes.values()].filter((r) => r.status === "published").length,
    findCardById: async (id: number, userId: number) => {
      const row = state.recipes.get(id);
      return row ? cardOf(row, userId) : null;
    },
    findRow: async (id: number) => state.recipes.get(id) ?? null,
    findDetailParts: async (id: number) => ({
      masters: null,
      equipment: (state.equipment.get(id) ?? []).map((e) => ({ id: e, name: `EQ${e}` })),
      ingredients: (state.ingredients.get(id) ?? []).map((i, idx) => ({
        ingredientId: idx + 1,
        name: i.name,
        amount: null,
        unitId: null,
        unitName: null,
        sortOrder: idx + 1,
      })),
      steps: (state.steps.get(id) ?? []).map((s) => ({
        stepNumber: s.step_number,
        instruction: s.instruction,
        imagePath: s.imagePath,
      })),
      media: state.media.get(id) ?? [],
    }),
    insertRecipe: async (input: Partial<RecipeRow>) => {
      const row = makeRow({ ...input, recipeId: state.recipes.size + 1 } as Partial<RecipeRow>);
      state.recipes.set(row.recipeId, row);
      return row;
    },
    updateRecipe: async (id: number, patch: Partial<RecipeRow>) => {
      const row = state.recipes.get(id);
      if (row) state.recipes.set(id, { ...row, ...patch });
    },
    replaceEquipment: async (id: number, ids: number[]) => {
      state.equipment.set(id, ids);
    },
    replaceIngredients: async (id: number, items: { name: string }[]) => {
      state.ingredients.set(id, items);
    },
    replaceSteps: async (id: number, steps: { step_number: number; instruction: string }[]) => {
      const existing = state.steps.get(id) ?? [];
      const imageByStep = new Map(existing.map((s) => [s.step_number, s.imagePath]));
      state.steps.set(
        id,
        steps.map((s) => ({ ...s, imagePath: imageByStep.get(s.step_number) ?? null })),
      );
      const kept = new Set(steps.map((s) => s.step_number));
      return existing
        .filter((s) => !kept.has(s.step_number) && s.imagePath != null)
        .map((s) => s.imagePath as string);
    },
    getCompleteness: async (id: number) => {
      const row = state.recipes.get(id);
      if (!row) return null;
      return {
        row,
        equipmentCount: (state.equipment.get(id) ?? []).length,
        ingredientCount: (state.ingredients.get(id) ?? []).length,
        stepCount: (state.steps.get(id) ?? []).length,
        hasCover: (state.media.get(id) ?? []).some((m) => m.isCover),
      };
    },
    collectStoragePaths: async (id: number) => ({
      recipeMedia: [
        ...(state.media.get(id) ?? []).map((m) => m.objectPath),
        ...(state.steps.get(id) ?? []).flatMap((s) => (s.imagePath ? [s.imagePath] : [])),
      ],
      commentImages: state.commentImagePaths.get(id) ?? [],
    }),
    deleteRecipe: async (id: number) => {
      state.recipes.delete(id);
    },
    countVideos: async (id: number) =>
      (state.media.get(id) ?? []).filter((m) => m.mediaType === "video").length,
    unsetCover: async (id: number) => {
      for (const m of state.media.get(id) ?? []) m.isCover = false;
    },
    insertMedia: async (input: Partial<MediaRow>) => {
      const row: MediaRow = {
        mediaId: state.nextMediaId++,
        createdAt: new Date(),
        ...input,
      } as MediaRow;
      const list = state.media.get(row.recipeId) ?? [];
      list.push(row);
      state.media.set(row.recipeId, list);
      return row;
    },
    findMedia: async (mediaId: number) => {
      for (const list of state.media.values()) {
        const found = list.find((m) => m.mediaId === mediaId);
        if (found) return found;
      }
      return null;
    },
    deleteMedia: async (mediaId: number) => {
      for (const [id, list] of state.media) {
        state.media.set(id, list.filter((m) => m.mediaId !== mediaId));
      }
    },
    findStep: async (id: number, stepNumber: number) => {
      const s = (state.steps.get(id) ?? []).find((x) => x.step_number === stepNumber);
      return s
        ? { stepId: stepNumber, recipeId: id, stepNumber, instruction: s.instruction, imagePath: s.imagePath }
        : null;
    },
    updateStepImage: async (stepId: number, imagePath: string) => {
      for (const list of state.steps.values()) {
        const s = list.find((x) => x.step_number === stepId);
        if (s) s.imagePath = imagePath;
      }
    },
  };
  return repo as unknown as RecipesRepository;
}

const makeStorage = (state: State) => ({
  upload: async (_b: string, path: string) => path,
  remove: async (bucket: string, paths: string[]) => {
    if (paths.length > 0) state.removed.push({ bucket, paths });
  },
  publicUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
});

const owner = { userId: 1, role: "user" };
const stranger = { userId: 2, role: "user" };

const expectAppError = async (fn: () => Promise<unknown>, status: number, code: string) => {
  try {
    await fn();
    throw new Error(`expected AppError ${code}, nothing thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(status);
    expect((e as AppError).code).toBe(code);
    return e as AppError;
  }
};

/** Media passthrough — compression itself is covered in media-processing.test.ts */
const passthroughMedia = {
  processImage: async (f: File) => f,
  processVideo: async (f: File) => f,
};

let state: State;
let service: RecipesService;

beforeEach(() => {
  state = emptyState();
  service = new RecipesService({
    repo: makeRepo(state),
    storage: makeStorage(state),
    media: passthroughMedia,
  });
});

// ===== publish validation matrix =====

describe("publish", () => {
  it("publishes a complete draft (sets published_at)", async () => {
    seedComplete(state);
    const res = await service.publish(1, owner);
    expect(res.status).toBe("published");
    expect(res.published_at).not.toBeNull();
  });

  it("INCOMPLETE_RECIPE lists every missing field for an empty draft", async () => {
    state.recipes.set(
      1,
      makeRow({
        recipeName: null,
        description: null,
        skillLevelId: null,
        cookTimeMinutes: null,
        cookingMethodId: null,
        categoryId: null,
      }),
    );
    const err = await expectAppError(() => service.publish(1, owner), 400, "INCOMPLETE_RECIPE");
    expect(err.details).toEqual([
      "recipe_name",
      "description",
      "skill_level",
      "cooking_method",
      "cook_time_minutes",
      "category",
      "equipment",
      "ingredients",
      "steps",
      "cover_image",
    ]);
  });

  it("INCOMPLETE_RECIPE pinpoints a single missing field", async () => {
    seedComplete(state);
    state.media.set(1, []); // no cover
    const err = await expectAppError(() => service.publish(1, owner), 400, "INCOMPLETE_RECIPE");
    expect(err.details).toEqual(["cover_image"]);
  });

  it("INVALID_STATUS when publishing a non-draft", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    await expectAppError(() => service.publish(1, owner), 400, "INVALID_STATUS");
  });

  it("403 for non-owner", async () => {
    seedComplete(state);
    await expectAppError(() => service.publish(1, stranger), 403, "FORBIDDEN");
  });
});

// ===== detail visibility =====

describe("getDetail", () => {
  it("404 for unknown recipe", async () => {
    await expectAppError(() => service.getDetail(99, owner), 404, "RECIPE_NOT_FOUND");
  });

  it("draft is owner-only (403 for others)", async () => {
    seedComplete(state);
    await expectAppError(() => service.getDetail(1, stranger), 403, "FORBIDDEN");
  });

  it("published post is visible to others with is_owner=false", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    const res = await service.getDetail(1, stranger);
    expect(res.is_owner).toBe(false);
    expect(res.cover_image_url).toBe("https://cdn.test/recipe-media/1/cover.jpg");
  });
});

// ===== update =====

describe("update", () => {
  it("403 for non-owner", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.update(1, { recipe_name: "X" }, stranger),
      403,
      "FORBIDDEN",
    );
  });

  it("draft can be gutted freely (ingredients: [])", async () => {
    seedComplete(state);
    const res = await service.update(1, { ingredients: [] }, owner);
    expect(res.ingredients).toEqual([]);
  });

  it("published post rejects an update that breaks completeness", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    const err = await expectAppError(
      () => service.update(1, { ingredients: [] }, owner),
      400,
      "INCOMPLETE_RECIPE",
    );
    expect(err.details).toEqual(["ingredients"]);
  });

  it("published post accepts a completeness-preserving update", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    const res = await service.update(1, { recipe_name: "New name" }, owner);
    expect(res.recipe_name).toBe("New name");
  });

  it("replacing steps deletes images of removed steps from storage", async () => {
    seedComplete(state);
    state.steps.set(1, [
      { step_number: 1, instruction: "Boil", imagePath: "1/step1.jpg" },
      { step_number: 2, instruction: "Serve", imagePath: "1/step2.jpg" },
    ]);
    await service.update(
      1,
      { steps: [{ step_number: 1, instruction: "Boil harder" }] },
      owner,
    );
    expect(state.removed).toEqual([{ bucket: "recipe-media", paths: ["1/step2.jpg"] }]);
    // surviving step keeps its image
    expect(state.steps.get(1)![0]!.imagePath).toBe("1/step1.jpg");
  });

  it("rejects duplicate step_number", async () => {
    seedComplete(state);
    await expectAppError(
      () =>
        service.update(
          1,
          {
            steps: [
              { step_number: 1, instruction: "a" },
              { step_number: 1, instruction: "b" },
            ],
          },
          owner,
        ),
      400,
      "VALIDATION_ERROR",
    );
  });
});

// ===== visibility =====

describe("setVisibility", () => {
  it("INVALID_STATUS for a draft", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.setVisibility(1, { status: "private" }, owner),
      400,
      "INVALID_STATUS",
    );
  });

  it("published → private keeps the original published_at", async () => {
    const publishedAt = new Date("2026-07-05T00:00:00Z");
    seedComplete(state, { status: "published", publishedAt });
    const res = await service.setVisibility(1, { status: "private" }, owner);
    expect(res.status).toBe("private");
    expect(res.published_at).toBe(publishedAt.toISOString());
  });

  it("private → published re-validates completeness", async () => {
    seedComplete(state, { status: "private", publishedAt: new Date() });
    state.media.set(1, []); // cover was deleted while private
    const err = await expectAppError(
      () => service.setVisibility(1, { status: "published" }, owner),
      400,
      "INCOMPLETE_RECIPE",
    );
    expect(err.details).toEqual(["cover_image"]);
  });
});

// ===== delete =====

describe("delete", () => {
  it("collects storage paths from media + step images + comment images", async () => {
    seedComplete(state);
    state.steps.set(1, [{ step_number: 1, instruction: "Boil", imagePath: "1/step1.jpg" }]);
    state.commentImagePaths.set(1, ["9/c.jpg"]);
    await service.delete(1, owner);
    expect(state.recipes.has(1)).toBe(false);
    expect(state.removed).toEqual([
      { bucket: "recipe-media", paths: ["1/cover.jpg", "1/step1.jpg"] },
      { bucket: "comment-images", paths: ["9/c.jpg"] },
    ]);
  });

  it("403 for non-owner", async () => {
    seedComplete(state);
    await expectAppError(() => service.delete(1, stranger), 403, "FORBIDDEN");
  });
});

// ===== media =====

const imageFile = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });
const videoFile = () => new File(["x"], "clip.mp4", { type: "video/mp4" });

describe("addMedia", () => {
  it("409 VIDEO_LIMIT on a second video", async () => {
    seedComplete(state);
    await service.addMedia(1, { file: videoFile(), type: "video" }, owner);
    await expectAppError(
      () => service.addMedia(1, { file: videoFile(), type: "video" }, owner),
      409,
      "VIDEO_LIMIT",
    );
  });

  it("a new cover unsets the previous one", async () => {
    seedComplete(state); // seeded with a cover
    const res = await service.addMedia(
      1,
      { file: imageFile(), type: "image", is_cover: "true" },
      owner,
    );
    expect(res.is_cover).toBe(true);
    const covers = state.media.get(1)!.filter((m) => m.isCover);
    expect(covers).toHaveLength(1);
    expect(covers[0]!.mediaId).toBe(res.media_id);
  });

  it("rejects a mime/type mismatch", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.addMedia(1, { file: videoFile(), type: "image" }, owner),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("rejects a video cover", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.addMedia(1, { file: videoFile(), type: "video", is_cover: true }, owner),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("deleteMedia", () => {
  it("404 when the media belongs to another recipe", async () => {
    seedComplete(state);
    seedComplete(state, { recipeId: 2 });
    const otherMedia = state.media.get(2)![0]!;
    await expectAppError(
      () => service.deleteMedia(1, otherMedia.mediaId, owner),
      404,
      "MEDIA_NOT_FOUND",
    );
  });

  it("blocks removing the cover of a published recipe", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    const cover = state.media.get(1)![0]!;
    const err = await expectAppError(
      () => service.deleteMedia(1, cover.mediaId, owner),
      400,
      "INCOMPLETE_RECIPE",
    );
    expect(err.details).toEqual(["cover_image"]);
  });

  it("removes the row and the file for a draft", async () => {
    seedComplete(state);
    const cover = state.media.get(1)![0]!;
    await service.deleteMedia(1, cover.mediaId, owner);
    expect(state.media.get(1)).toEqual([]);
    expect(state.removed).toEqual([
      { bucket: "recipe-media", paths: ["1/cover.jpg"] },
    ]);
  });
});

describe("putStepImage", () => {
  it("404 STEP_NOT_FOUND for a missing step", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.putStepImage(1, 99, imageFile(), owner),
      404,
      "STEP_NOT_FOUND",
    );
  });

  it("replaces the existing image and deletes the old file", async () => {
    seedComplete(state);
    state.steps.set(1, [{ step_number: 1, instruction: "Boil", imagePath: "1/old.jpg" }]);
    const res = await service.putStepImage(1, 1, imageFile(), owner);
    expect(res.image_url).toContain("https://cdn.test/recipe-media/1/");
    expect(state.removed).toEqual([{ bucket: "recipe-media", paths: ["1/old.jpg"] }]);
  });
});

// ===== feed =====

describe("getFeed", () => {
  it("returns only published cards in the pagination envelope", async () => {
    seedComplete(state, { status: "published", publishedAt: new Date() });
    seedComplete(state, { recipeId: 2 }); // draft — excluded
    const res = await service.getFeed({}, stranger);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      recipe_id: 1,
      author: { user_id: 1, display_name: "user-1", tier_name: "Bronze" },
      is_owner: false,
      status: "published",
    });
    expect(res.pagination).toEqual({ page: 1, limit: 20, total: 1, total_pages: 1 });
  });
});

// ===== multipart create/update (single-shot, decision 2026-07-10) =====

describe("createFromMultipart", () => {
  const png = () => new File(["x"], "img.png", { type: "image/png" });
  const completeData = () =>
    JSON.stringify({
      recipe_name: "One Shot Curry",
      description: "d",
      cook_time_minutes: 10,
      skill_level_id: 1,
      cooking_method_id: 1,
      category_id: 1,
      equipment_ids: [1],
      ingredients: [{ name: "Chili" }],
      steps: [{ step_number: 1, instruction: "Cook" }],
    });

  it("creates draft + cover + step image in one call", async () => {
    const res = await service.createFromMultipart(
      { data: completeData(), cover: png(), step_image_1: png() },
      owner,
    );
    expect(res.status).toBe("draft");
    expect(res.media.filter((m) => m.is_cover)).toHaveLength(1);
    expect(res.steps[0]!.image_url).not.toBeNull();
  });

  it("publish=true publishes in the same request", async () => {
    const res = await service.createFromMultipart(
      { data: completeData(), cover: png(), publish: "true" },
      owner,
    );
    expect(res.status).toBe("published");
    expect(res.published_at).not.toBeNull();
  });

  it("publish=true on an incomplete recipe rolls EVERYTHING back (all-or-nothing)", async () => {
    const err = await expectAppError(
      () =>
        service.createFromMultipart(
          { data: completeData(), publish: true }, // no cover
          owner,
        ),
      400,
      "INCOMPLETE_RECIPE",
    );
    expect(err.details).toEqual(["cover_image"]);
    expect(state.recipes.size).toBe(0); // recipe deleted by the rollback
  });

  it("a failed upload rolls the creation back", async () => {
    const failingStorage = {
      ...makeStorage(state),
      upload: async () => {
        throw new Error("storage down");
      },
    };
    const failing = new RecipesService({
      repo: makeRepo(state),
      storage: failingStorage,
      media: passthroughMedia,
    });
    try {
      await failing.createFromMultipart({ data: completeData(), cover: png() }, owner);
      throw new Error("expected upload failure");
    } catch (e) {
      expect((e as Error).message).toContain("storage down");
    }
    expect(state.recipes.size).toBe(0);
  });

  it("step_image_{n} without a matching step -> 400 before anything is written", async () => {
    await expectAppError(
      () =>
        service.createFromMultipart(
          { data: completeData(), step_image_9: png() },
          owner,
        ),
      400,
      "VALIDATION_ERROR",
    );
    expect(state.recipes.size).toBe(0);
  });

  it("rejects malformed data JSON and non-image step files", async () => {
    await expectAppError(
      () => service.createFromMultipart({ data: "{not json" }, owner),
      400,
      "VALIDATION_ERROR",
    );
    await expectAppError(
      () =>
        service.createFromMultipart(
          {
            data: completeData(),
            step_image_1: new File(["x"], "a.mp4", { type: "video/mp4" }),
          },
          owner,
        ),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("updateFromMultipart", () => {
  const png = () => new File(["x"], "img.png", { type: "image/png" });

  it("applies data and replaces the cover", async () => {
    seedComplete(state);
    const oldCover = state.media.get(1)![0]!;
    const res = await service.updateFromMultipart(
      1,
      { data: JSON.stringify({ recipe_name: "Renamed" }), cover: png() },
      owner,
    );
    expect(res.recipe_name).toBe("Renamed");
    const covers = state.media.get(1)!.filter((m) => m.isCover);
    expect(covers).toHaveLength(1);
    expect(covers[0]!.mediaId).not.toBe(oldCover.mediaId); // new cover unset the old
  });

  it("rejects publish on PATCH", async () => {
    seedComplete(state);
    await expectAppError(
      () => service.updateFromMultipart(1, { publish: "true" }, owner),
      400,
      "VALIDATION_ERROR",
    );
  });
});

// ===== create =====

describe("create", () => {
  it("creates an empty draft (AC M1-5)", async () => {
    const res = await service.create({}, owner);
    expect(res.status).toBe("draft");
    expect(res.is_owner).toBe(true);
  });

  it("creates a draft with nested sets", async () => {
    const res = await service.create(
      {
        recipe_name: "Pad Thai",
        equipment_ids: [1, 2],
        ingredients: [{ name: "Noodles" }],
        steps: [{ step_number: 1, instruction: "Fry" }],
      },
      owner,
    );
    expect(res.recipe_name).toBe("Pad Thai");
    expect(res.equipment).toHaveLength(2);
    expect(res.ingredients).toHaveLength(1);
    expect(res.steps).toHaveLength(1);
  });
});
