import { Elysia } from "elysia";
import { authPlugin } from "../../shared/plugins/auth.plugin";
import { PaginationQueryDTO } from "../../shared/utils/pagination";
import { engagementService } from "./services/engagement.service";
import {
  CommentDTO,
  CommentIdParams,
  CommentListResponseDTO,
  CreateCommentDTO,
  FavoriteResponseDTO,
  LikeResponseDTO,
  RecipeIdParams,
  UpdateCommentDTO,
} from "./dto/engagement.dto";

/**
 * Module 4 — Engagement (doc/api/04-engagement.md). Bearer on all routes.
 * Engagement targets published recipes only (decision 2026-07-10).
 */
export const engagementController = new Elysia()
  .use(authPlugin)

  // ===== like =====
  .put(
    "/recipes/:id/like",
    ({ params, currentUser }) => engagementService.like(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: LikeResponseDTO },
      detail: {
        tags: ["Engagement"],
        summary: "Like (idempotent)",
        description: "The DB trigger updates the post owner's tier automatically (ADR-012).",
      },
    },
  )
  .delete(
    "/recipes/:id/like",
    ({ params, currentUser }) => engagementService.unlike(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: LikeResponseDTO },
      detail: { tags: ["Engagement"], summary: "Unlike" },
    },
  )

  // ===== favorite =====
  .put(
    "/recipes/:id/favorite",
    ({ params, currentUser }) => engagementService.favorite(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: FavoriteResponseDTO },
      detail: {
        tags: ["Engagement"],
        summary: "Favorite (idempotent)",
        description: "Appears in the saved list immediately.",
      },
    },
  )
  .delete(
    "/recipes/:id/favorite",
    ({ params, currentUser }) => engagementService.unfavorite(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: FavoriteResponseDTO },
      detail: { tags: ["Engagement"], summary: "Unfavorite" },
    },
  )

  // ===== comments =====
  .get(
    "/recipes/:id/comments",
    ({ params, query, currentUser }) =>
      engagementService.getComments(params.id, query, currentUser),
    {
      params: RecipeIdParams,
      query: PaginationQueryDTO,
      response: { 200: CommentListResponseDTO },
      detail: {
        tags: ["Engagement"],
        summary: "List comments",
        description: "Latest first (AC M2-5); soft-deleted comments never returned (ADR-008).",
      },
    },
  )
  .post(
    "/recipes/:id/comments",
    async ({ params, body, currentUser, set }) => {
      set.status = 201;
      return engagementService.addComment(params.id, body, currentUser);
    },
    {
      params: RecipeIdParams,
      body: CreateCommentDTO,
      response: { 201: CommentDTO },
      detail: {
        tags: ["Engagement"],
        summary: "Add comment",
        description: "multipart; optional single image → comment-images bucket (ADR-009).",
      },
    },
  )
  .patch(
    "/comments/:commentId",
    ({ params, body, currentUser }) =>
      engagementService.updateComment(params.commentId, body, currentUser),
    {
      params: CommentIdParams,
      body: UpdateCommentDTO,
      response: { 200: CommentDTO },
      detail: {
        tags: ["Engagement"],
        summary: "Edit comment",
        description:
          "Comment owner only (ADR-008); sets updated_at. image replaces the existing file; remove_image=true clears it.",
      },
    },
  )
  .delete(
    "/comments/:commentId",
    async ({ params, currentUser, set }) => {
      await engagementService.deleteComment(params.commentId, currentUser);
      set.status = 204;
    },
    {
      params: CommentIdParams,
      detail: {
        tags: ["Engagement"],
        summary: "Delete comment (soft)",
        description: "Comment owner only — post owners cannot delete others' comments (ADR-008).",
      },
    },
  );
