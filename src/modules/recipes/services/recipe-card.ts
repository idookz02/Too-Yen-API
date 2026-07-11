/**
 * Shared recipe-card mapper — used by the recipes feed/detail and reused by
 * the profile lists (implementation-plan: one card shape everywhere).
 */
import type { CardRow } from "../repositories/recipes.repository";
import { BUCKETS, type Bucket } from "../../../shared/services/storage.service";

export type PublicUrlFn = (bucket: Bucket, path: string) => string;

export function mapRecipeCard(row: CardRow, currentUserId: number, publicUrl: PublicUrlFn) {
  return {
    recipe_id: row.recipeId,
    recipe_name: row.recipeName,
    cover_image_url: row.coverPath ? publicUrl(BUCKETS.recipeMedia, row.coverPath) : null,
    author: {
      user_id: row.authorId,
      display_name: row.authorName,
      tier_name: row.tierName,
    },
    like_count: row.likeCount,
    favorite_count: row.favoriteCount,
    comment_count: row.commentCount,
    liked_by_me: row.likedByMe,
    favorited_by_me: row.favoritedByMe,
    is_owner: row.authorId === currentUserId,
    status: row.status,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
  };
}
