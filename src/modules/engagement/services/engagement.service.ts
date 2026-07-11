import {
  engagementRepository,
  type CommentWithAuthor,
  type EngagementRepository,
} from "../repositories/engagement.repository";
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
import { badRequest, forbidden, notFound } from "../../../shared/utils/errors";
import { paginated, parsePagination } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import type { CreateCommentInput, UpdateCommentInput } from "../dto/engagement.dto";

export type EngagementServiceDeps = {
  repo?: EngagementRepository;
  storage?: Pick<StorageService, "upload" | "remove" | "publicUrl">;
  media?: Pick<MediaProcessingService, "processImage">;
};

export class EngagementService {
  private readonly repo: EngagementRepository;
  private readonly storage: NonNullable<EngagementServiceDeps["storage"]>;
  private readonly media: NonNullable<EngagementServiceDeps["media"]>;

  constructor(deps: EngagementServiceDeps = {}) {
    this.repo = deps.repo ?? engagementRepository;
    this.storage = deps.storage ?? storageService;
    this.media = deps.media ?? mediaProcessingService;
  }

  // ===== like =====

  async like(recipeId: number, user: CurrentUser) {
    await this.requirePublished(recipeId);
    await this.repo.like(recipeId, user.userId); // idempotent (ON CONFLICT DO NOTHING)
    return { liked: true, like_count: await this.repo.likeCount(recipeId) };
  }

  async unlike(recipeId: number, user: CurrentUser) {
    await this.requirePublished(recipeId);
    await this.repo.unlike(recipeId, user.userId);
    return { liked: false, like_count: await this.repo.likeCount(recipeId) };
  }

  // ===== favorite =====

  async favorite(recipeId: number, user: CurrentUser) {
    await this.requirePublished(recipeId);
    await this.repo.favorite(recipeId, user.userId);
    return { favorited: true, favorite_count: await this.repo.favoriteCount(recipeId) };
  }

  async unfavorite(recipeId: number, user: CurrentUser) {
    await this.requirePublished(recipeId);
    await this.repo.unfavorite(recipeId, user.userId);
    return { favorited: false, favorite_count: await this.repo.favoriteCount(recipeId) };
  }

  // ===== comments =====

  async getComments(
    recipeId: number,
    query: { page?: number; limit?: number },
    user: CurrentUser,
  ) {
    await this.requirePublished(recipeId);
    const { page, limit, offset } = parsePagination(query);
    const [rows, total] = await Promise.all([
      this.repo.listComments(recipeId, { limit, offset }),
      this.repo.countComments(recipeId),
    ]);
    return paginated(rows.map((r) => this.mapComment(r, user)), page, limit, total);
  }

  async addComment(recipeId: number, input: CreateCommentInput, user: CurrentUser) {
    await this.requirePublished(recipeId);
    const created = await this.repo.insertComment({
      recipeId,
      userId: user.userId,
      commentText: input.comment_text,
    });
    if (input.image) {
      const processed = await this.media.processImage(input.image, "commentImage");
      const path = await this.storage.upload(
        BUCKETS.commentImages,
        buildObjectPath(created.commentId, processed),
        processed,
      );
      await this.repo.updateCommentImage(created.commentId, path);
    }
    const full = await this.repo.findCommentWithAuthor(created.commentId);
    if (!full) throw new Error(`comment ${created.commentId} vanished after insert`);
    return this.mapComment(full, user);
  }

  // PATCH /comments/{id} — comment owner only (ADR-008)
  async updateComment(commentId: number, input: UpdateCommentInput, user: CurrentUser) {
    const existing = await this.requireOwnComment(commentId, user);
    const oldImagePath = existing.imagePath; // capture before any mutation
    const removeImage = input.remove_image === true || input.remove_image === "true";
    if (removeImage && input.image) {
      throw badRequest(
        "image and remove_image are mutually exclusive",
        "VALIDATION_ERROR",
      );
    }

    let imagePath: string | null | undefined; // undefined = keep as-is
    if (input.image) {
      const processed = await this.media.processImage(input.image, "commentImage");
      imagePath = await this.storage.upload(
        BUCKETS.commentImages,
        buildObjectPath(commentId, processed),
        processed,
      );
    } else if (removeImage) {
      imagePath = null;
    }

    await this.repo.updateComment(commentId, {
      ...(input.comment_text !== undefined && { commentText: input.comment_text }),
      ...(imagePath !== undefined && { imagePath }),
      updatedAt: new Date(),
    });
    // old file is gone from the row — remove it from the bucket too (ADR-009)
    if (imagePath !== undefined && oldImagePath) {
      await this.storage.remove(BUCKETS.commentImages, [oldImagePath]);
    }

    const full = await this.repo.findCommentWithAuthor(commentId);
    if (!full) throw new Error(`comment ${commentId} vanished after update`);
    return this.mapComment(full, user);
  }

  // DELETE /comments/{id} — soft delete; post owners cannot delete others' (ADR-008)
  async deleteComment(commentId: number, user: CurrentUser) {
    await this.requireOwnComment(commentId, user);
    await this.repo.softDeleteComment(commentId);
    // image file stays with the soft-deleted row; the Step-9 cleanup job removes orphans
  }

  // ===== helpers =====

  /**
   * Engagement is available on published recipes only (decision 2026-07-10) —
   * draft/private posts cannot be liked/favorited/commented, even by the owner.
   */
  private async requirePublished(recipeId: number) {
    const row = await this.repo.findRecipeStatus(recipeId);
    if (!row) throw notFound("Recipe not found", "RECIPE_NOT_FOUND");
    if (row.status !== "published") {
      throw forbidden("Engagement is only available on published recipes", "FORBIDDEN");
    }
    return row;
  }

  private async requireOwnComment(commentId: number, user: CurrentUser) {
    const row = await this.repo.findCommentWithAuthor(commentId);
    if (!row || row.isDeleted) throw notFound("Comment not found", "COMMENT_NOT_FOUND");
    if (row.userId !== user.userId) {
      throw forbidden("Only the comment owner can modify it", "FORBIDDEN");
    }
    return row;
  }

  private mapComment(row: CommentWithAuthor, user: CurrentUser) {
    return {
      comment_id: row.commentId,
      comment_text: row.commentText,
      image_url: row.imagePath
        ? this.storage.publicUrl(BUCKETS.commentImages, row.imagePath)
        : null,
      author: {
        user_id: row.userId,
        display_name: row.authorName,
        tier_name: row.tierName,
      },
      is_mine: row.userId === user.userId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}

export const engagementService = new EngagementService();
