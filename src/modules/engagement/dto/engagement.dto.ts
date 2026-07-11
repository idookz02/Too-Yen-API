import { t } from "elysia";

// ============================================================================
// Request DTOs (doc/api/04-engagement.md)
// ============================================================================

export const RecipeIdParams = t.Object({ id: t.Numeric({ minimum: 1 }) });
export const CommentIdParams = t.Object({ commentId: t.Numeric({ minimum: 1 }) });

/** POST /recipes/{id}/comments — multipart; empty text → 400 (AC M2-3) */
export const CreateCommentDTO = t.Object({
  comment_text: t.String({ minLength: 1 }),
  image: t.Optional(t.File({ type: "image" })),
});
export type CreateCommentInput = typeof CreateCommentDTO.static;

/** PATCH /comments/{id} — multipart; image replaces existing, remove_image clears it */
export const UpdateCommentDTO = t.Object({
  comment_text: t.Optional(t.String({ minLength: 1 })),
  image: t.Optional(t.File({ type: "image" })),
  remove_image: t.Optional(
    t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]),
  ),
});
export type UpdateCommentInput = typeof UpdateCommentDTO.static;

// ============================================================================
// Response DTOs
// ============================================================================

export const LikeResponseDTO = t.Object({
  liked: t.Boolean(),
  like_count: t.Number(),
});

export const FavoriteResponseDTO = t.Object({
  favorited: t.Boolean(),
  favorite_count: t.Number(),
});

export const CommentDTO = t.Object({
  comment_id: t.Number(),
  comment_text: t.String(),
  image_url: t.Union([t.String(), t.Null()]),
  author: t.Object({
    user_id: t.Number(),
    display_name: t.String(),
    tier_name: t.Union([t.String(), t.Null()]),
  }),
  is_mine: t.Boolean(),
  created_at: t.String({ format: "date-time" }),
  updated_at: t.Union([t.String({ format: "date-time" }), t.Null()]),
});

export const CommentListResponseDTO = t.Object({
  data: t.Array(CommentDTO),
  pagination: t.Object({
    page: t.Number(),
    limit: t.Number(),
    total: t.Number(),
    total_pages: t.Number(),
  }),
});
