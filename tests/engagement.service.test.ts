/**
 * EngagementService unit tests with an in-memory mock repository.
 * Covers: idempotent like/favorite, published-only rule (decision 2026-07-10),
 * comment owner-only edit/delete, soft-delete filtering, image handling.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { EngagementService } from "../src/modules/engagement/services/engagement.service";
import { AppError } from "../src/shared/utils/errors";
import type {
  CommentWithAuthor,
  EngagementRepository,
} from "../src/modules/engagement/repositories/engagement.repository";

type State = {
  recipes: Map<number, { userId: number; status: string }>;
  likes: Set<string>;
  favorites: Set<string>;
  comments: Map<number, CommentWithAuthor>;
  removed: { bucket: string; paths: string[] }[];
  nextCommentId: number;
};

let state: State;
let service: EngagementService;

const makeComment = (over: Partial<CommentWithAuthor> = {}): CommentWithAuthor => ({
  commentId: 1,
  recipeId: 1,
  userId: 2,
  commentText: "Looks delicious",
  imagePath: null,
  isDeleted: false,
  createdAt: new Date("2026-07-10T00:00:00Z"),
  updatedAt: null,
  authorName: "Aor",
  tierName: "Bronze",
  ...over,
});

beforeEach(() => {
  state = {
    recipes: new Map([[1, { userId: 1, status: "published" }]]),
    likes: new Set(),
    favorites: new Set(),
    comments: new Map(),
    removed: [],
    nextCommentId: 1,
  };
  const repo = {
    findRecipeStatus: async (id: number) => state.recipes.get(id) ?? null,
    like: async (id: number, uid: number) => {
      state.likes.add(`${id}:${uid}`);
    },
    unlike: async (id: number, uid: number) => {
      state.likes.delete(`${id}:${uid}`);
    },
    likeCount: async (id: number) =>
      [...state.likes].filter((k) => k.startsWith(`${id}:`)).length,
    favorite: async (id: number, uid: number) => {
      state.favorites.add(`${id}:${uid}`);
    },
    unfavorite: async (id: number, uid: number) => {
      state.favorites.delete(`${id}:${uid}`);
    },
    favoriteCount: async (id: number) =>
      [...state.favorites].filter((k) => k.startsWith(`${id}:`)).length,
    listComments: async (id: number) =>
      [...state.comments.values()].filter((c) => c.recipeId === id && !c.isDeleted),
    countComments: async (id: number) =>
      [...state.comments.values()].filter((c) => c.recipeId === id && !c.isDeleted).length,
    insertComment: async (input: { recipeId: number; userId: number; commentText: string }) => {
      const row = makeComment({
        commentId: state.nextCommentId++,
        recipeId: input.recipeId,
        userId: input.userId,
        commentText: input.commentText,
      });
      state.comments.set(row.commentId, row);
      return row;
    },
    findCommentWithAuthor: async (id: number) => state.comments.get(id) ?? null,
    updateComment: async (id: number, patch: Record<string, unknown>) => {
      const row = state.comments.get(id);
      if (!row) return;
      if (patch.commentText !== undefined) row.commentText = patch.commentText as string;
      if ("imagePath" in patch) row.imagePath = patch.imagePath as string | null;
      row.updatedAt = patch.updatedAt as Date;
    },
    updateCommentImage: async (id: number, path: string | null) => {
      const row = state.comments.get(id);
      if (row) row.imagePath = path;
    },
    softDeleteComment: async (id: number) => {
      const row = state.comments.get(id);
      if (row) row.isDeleted = true;
    },
  };
  service = new EngagementService({
    repo: repo as unknown as EngagementRepository,
    storage: {
      upload: async (_b: string, path: string) => path,
      remove: async (bucket: string, paths: string[]) => {
        if (paths.length > 0) state.removed.push({ bucket, paths });
      },
      publicUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
    } as never,
    media: { processImage: async (f: File) => f },
  });
});

const owner = { userId: 1, role: "user" };
const other = { userId: 2, role: "user" };

const expectAppError = async (fn: () => Promise<unknown>, status: number, code: string) => {
  try {
    await fn();
    throw new Error(`expected AppError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(status);
    expect((e as AppError).code).toBe(code);
  }
};

describe("like / favorite", () => {
  it("like returns liked=true with a fresh count", async () => {
    const res = await service.like(1, other);
    expect(res).toEqual({ liked: true, like_count: 1 });
  });

  it("double like is idempotent (count stays 1)", async () => {
    await service.like(1, other);
    const res = await service.like(1, other);
    expect(res.like_count).toBe(1);
  });

  it("unlike returns liked=false", async () => {
    await service.like(1, other);
    const res = await service.unlike(1, other);
    expect(res).toEqual({ liked: false, like_count: 0 });
  });

  it("favorite/unfavorite mirror the same behaviour", async () => {
    expect(await service.favorite(1, other)).toEqual({ favorited: true, favorite_count: 1 });
    expect(await service.unfavorite(1, other)).toEqual({ favorited: false, favorite_count: 0 });
  });

  it("404 for a missing recipe", async () => {
    await expectAppError(() => service.like(99, other), 404, "RECIPE_NOT_FOUND");
  });

  it("403 on a draft — even for the owner (published-only decision)", async () => {
    state.recipes.set(2, { userId: 1, status: "draft" });
    await expectAppError(() => service.like(2, owner), 403, "FORBIDDEN");
  });

  it("403 on another user's private post", async () => {
    state.recipes.set(3, { userId: 1, status: "private" });
    await expectAppError(() => service.favorite(3, other), 403, "FORBIDDEN");
  });
});

describe("comments", () => {
  it("addComment stores text and maps the author", async () => {
    const res = await service.addComment(1, { comment_text: "Yum!" }, other);
    expect(res).toMatchObject({
      comment_text: "Yum!",
      author: { user_id: 2, display_name: "Aor", tier_name: "Bronze" },
      is_mine: true,
      image_url: null,
      updated_at: null,
    });
  });

  it("addComment uploads the optional image into comment-images", async () => {
    const img = new File(["x"], "pic.jpg", { type: "image/jpeg" });
    const res = await service.addComment(1, { comment_text: "with pic", image: img }, other);
    expect(res.image_url).toContain("https://cdn.test/comment-images/1/");
  });

  it("soft-deleted comments are excluded from the list", async () => {
    await service.addComment(1, { comment_text: "a" }, other);
    await service.addComment(1, { comment_text: "b" }, other);
    await service.deleteComment(1, other);
    const res = await service.getComments(1, {}, owner);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.comment_text).toBe("b");
    expect(res.data[0]!.is_mine).toBe(false);
  });

  it("updateComment sets updated_at and is owner-only", async () => {
    await service.addComment(1, { comment_text: "orig" }, other);
    await expectAppError(
      () => service.updateComment(1, { comment_text: "hack" }, owner),
      403,
      "FORBIDDEN",
    );
    const res = await service.updateComment(1, { comment_text: "edited" }, other);
    expect(res.comment_text).toBe("edited");
    expect(res.updated_at).not.toBeNull();
  });

  it("image + remove_image together → 400", async () => {
    await service.addComment(1, { comment_text: "x" }, other);
    const img = new File(["x"], "p.jpg", { type: "image/jpeg" });
    await expectAppError(
      () => service.updateComment(1, { image: img, remove_image: "true" }, other),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("replacing the image deletes the old file", async () => {
    const img1 = new File(["1"], "one.jpg", { type: "image/jpeg" });
    await service.addComment(1, { comment_text: "x", image: img1 }, other);
    const oldPath = state.comments.get(1)!.imagePath!;
    const img2 = new File(["2"], "two.jpg", { type: "image/jpeg" });
    await service.updateComment(1, { image: img2 }, other);
    expect(state.removed).toEqual([{ bucket: "comment-images", paths: [oldPath] }]);
  });

  it("remove_image clears the path and deletes the file", async () => {
    const img = new File(["1"], "one.jpg", { type: "image/jpeg" });
    await service.addComment(1, { comment_text: "x", image: img }, other);
    const oldPath = state.comments.get(1)!.imagePath!;
    const res = await service.updateComment(1, { remove_image: true }, other);
    expect(res.image_url).toBeNull();
    expect(state.removed).toEqual([{ bucket: "comment-images", paths: [oldPath] }]);
  });

  it("deleteComment is soft and owner-only (post owner cannot delete)", async () => {
    await service.addComment(1, { comment_text: "keep me" }, other);
    // post owner (user 1) tries to delete user 2's comment → 403 (ADR-008)
    await expectAppError(() => service.deleteComment(1, owner), 403, "FORBIDDEN");
    await service.deleteComment(1, other);
    expect(state.comments.get(1)!.isDeleted).toBe(true);
    // editing a deleted comment → 404
    await expectAppError(
      () => service.updateComment(1, { comment_text: "zombie" }, other),
      404,
      "COMMENT_NOT_FOUND",
    );
  });

  it("commenting on a draft is blocked (published-only)", async () => {
    state.recipes.set(2, { userId: 1, status: "draft" });
    await expectAppError(
      () => service.addComment(2, { comment_text: "hi" }, owner),
      403,
      "FORBIDDEN",
    );
  });
});
