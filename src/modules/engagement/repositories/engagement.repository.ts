import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import {
  comment,
  masterTier,
  recipe,
  recipeFavorite,
  recipeLike,
  users,
} from "../../../db/schema";

export type CommentWithAuthor = typeof comment.$inferSelect & {
  authorName: string;
  tierName: string | null;
};

const commentWithAuthorSelect = {
  comment: comment,
  authorName: users.displayName,
  tierName: masterTier.name,
};

const flatten = (row: {
  comment: typeof comment.$inferSelect;
  authorName: string;
  tierName: string | null;
}): CommentWithAuthor => ({ ...row.comment, authorName: row.authorName, tierName: row.tierName });

export class EngagementRepository {
  async findRecipeStatus(recipeId: number, executor: Executor = db) {
    const [row] = await executor
      .select({ userId: recipe.userId, status: recipe.status })
      .from(recipe)
      .where(eq(recipe.recipeId, recipeId))
      .limit(1);
    return row ?? null;
  }

  // ===== like / favorite (idempotent upsert / delete — ADR-008) =====

  async like(recipeId: number, userId: number, executor: Executor = db): Promise<void> {
    await executor.insert(recipeLike).values({ recipeId, userId }).onConflictDoNothing();
  }

  async unlike(recipeId: number, userId: number, executor: Executor = db): Promise<void> {
    await executor
      .delete(recipeLike)
      .where(and(eq(recipeLike.recipeId, recipeId), eq(recipeLike.userId, userId)));
  }

  async likeCount(recipeId: number, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipeLike)
      .where(eq(recipeLike.recipeId, recipeId));
    return row?.total ?? 0;
  }

  async favorite(recipeId: number, userId: number, executor: Executor = db): Promise<void> {
    await executor.insert(recipeFavorite).values({ recipeId, userId }).onConflictDoNothing();
  }

  async unfavorite(recipeId: number, userId: number, executor: Executor = db): Promise<void> {
    await executor
      .delete(recipeFavorite)
      .where(and(eq(recipeFavorite.recipeId, recipeId), eq(recipeFavorite.userId, userId)));
  }

  async favoriteCount(recipeId: number, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(recipeFavorite)
      .where(eq(recipeFavorite.recipeId, recipeId));
    return row?.total ?? 0;
  }

  // ===== comments =====

  /** Latest first (AC M2-5); always filters is_deleted = false (ADR-008). */
  async listComments(
    recipeId: number,
    opts: { limit: number; offset: number },
    executor: Executor = db,
  ): Promise<CommentWithAuthor[]> {
    const rows = await executor
      .select(commentWithAuthorSelect)
      .from(comment)
      .innerJoin(users, eq(comment.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(and(eq(comment.recipeId, recipeId), eq(comment.isDeleted, false)))
      .orderBy(desc(comment.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    return rows.map(flatten);
  }

  async countComments(recipeId: number, executor: Executor = db): Promise<number> {
    const [row] = await executor
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(comment)
      .where(and(eq(comment.recipeId, recipeId), eq(comment.isDeleted, false)));
    return row?.total ?? 0;
  }

  async insertComment(
    input: { recipeId: number; userId: number; commentText: string },
    executor: Executor = db,
  ) {
    const [created] = await executor.insert(comment).values(input).returning();
    if (!created) throw new Error("insertComment returned no row");
    return created;
  }

  async findCommentWithAuthor(
    commentId: number,
    executor: Executor = db,
  ): Promise<CommentWithAuthor | null> {
    const [row] = await executor
      .select(commentWithAuthorSelect)
      .from(comment)
      .innerJoin(users, eq(comment.userId, users.userId))
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(eq(comment.commentId, commentId))
      .limit(1);
    return row ? flatten(row) : null;
  }

  async updateComment(
    commentId: number,
    patch: { commentText?: string; imagePath?: string | null; updatedAt: Date },
    executor: Executor = db,
  ): Promise<void> {
    await executor.update(comment).set(patch).where(eq(comment.commentId, commentId));
  }

  async updateCommentImage(
    commentId: number,
    imagePath: string | null,
    executor: Executor = db,
  ): Promise<void> {
    await executor.update(comment).set({ imagePath }).where(eq(comment.commentId, commentId));
  }

  async softDeleteComment(commentId: number, executor: Executor = db): Promise<void> {
    await executor
      .update(comment)
      .set({ isDeleted: true })
      .where(eq(comment.commentId, commentId));
  }
}

export const engagementRepository = new EngagementRepository();
