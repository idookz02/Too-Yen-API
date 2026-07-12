import { Elysia, t } from "elysia";
import { authPlugin } from "../../shared/plugins/auth.plugin";
import { badRequest } from "../../shared/utils/errors";
import { recipesService } from "./services/recipes.service";
import {
  AddMediaDTO,
  FeedQueryDTO,
  FeedResponseDTO,
  MediaIdParams,
  MediaResponseDTO,
  MultipartRecipeBodyDTO,
  RecipeDetailDTO,
  RecipeIdParams,
  StepImageBodyDTO,
  StepImageParams,
  StepImageResponseDTO,
  VisibilityDTO,
} from "./dto/recipes.dto";

/** Friendly guard for the 2026-07-10 breaking change (JSON → multipart). */
const requireMultipart = (request: Request) => {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    throw badRequest(
      "This endpoint requires multipart/form-data — fields: data (JSON string), cover, step_image_{n}, publish",
      "VALIDATION_ERROR",
    );
  }
};

/** Module 3 — Recipes (doc/api/03-recipes.md). All routes require Bearer auth. */
export const recipesController = new Elysia({ prefix: "/recipes" })
  .use(authPlugin)

  // GET /recipes — home feed (published only)
  .get("/", ({ query, currentUser }) => recipesService.getFeed(query, currentUser), {
    query: FeedQueryDTO,
    response: { 200: FeedResponseDTO },
    detail: {
      tags: ["Recipes"],
      summary: "Home feed",
      description: "Published recipes; sort=newest|most_liked|most_favorited (default newest).",
    },
  })

  // GET /recipes/{id} — post detail
  .get(
    "/:id",
    ({ params, currentUser }) => recipesService.getDetail(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Recipe detail",
        description: "draft/private → owner only (403 FORBIDDEN).",
      },
    },
  )

  // POST /recipes — multipart: data + cover + step images (+ publish) in one shot
  .post(
    "/",
    async ({ body, request, currentUser, set }) => {
      requireMultipart(request);
      set.status = 201;
      return recipesService.createFromMultipart(
        body as Record<string, unknown>,
        currentUser,
      );
    },
    {
      body: MultipartRecipeBodyDTO,
      response: { 201: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Create recipe (multipart, single shot)",
        description:
          "multipart/form-data — data: JSON string with the recipe fields (AC M1-5: partial " +
          "allowed; ingredients find-or-created per ADR-001/007), cover: image file, " +
          "step_image_{n}: image for step_number n, publish=true: validate + publish " +
          "immediately. ALL-OR-NOTHING: a failed upload or failed publish validation rolls " +
          "the whole creation back.",
      },
    },
  )

  // PATCH /recipes/{id} — multipart: data (+ cover / step images)
  .patch(
    "/:id",
    ({ params, body, request, currentUser }) => {
      requireMultipart(request);
      return recipesService.updateFromMultipart(
        params.id,
        body as Record<string, unknown>,
        currentUser,
      );
    },
    {
      params: RecipeIdParams,
      body: MultipartRecipeBodyDTO,
      response: { 200: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Edit recipe (multipart)",
        description:
          "Owner only; arrays in data replace the whole set. On a published recipe the update " +
          "must not break completeness (400 INCOMPLETE_RECIPE). cover replaces the cover; " +
          "step_image_{n} sets/replaces that step's image. publish is rejected here.",
      },
    },
  )

  // POST /recipes/{id}/publish — draft only
  .post(
    "/:id/publish",
    ({ params, currentUser }) => recipesService.publish(params.id, currentUser),
    {
      params: RecipeIdParams,
      response: { 200: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Publish a draft",
        description:
          "Validates the AC M2-1 checklist → 400 INCOMPLETE_RECIPE with details[]. " +
          "Draft only; use /visibility for private↔published.",
      },
    },
  )

  // PATCH /recipes/{id}/visibility — published ↔ private
  .patch(
    "/:id/visibility",
    ({ params, body, currentUser }) =>
      recipesService.setVisibility(params.id, body, currentUser),
    {
      params: RecipeIdParams,
      body: VisibilityDTO,
      response: { 200: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Toggle visibility",
        description:
          "published ↔ private only (AC M3); private→published re-validates completeness.",
      },
    },
  )

  // DELETE /recipes/{id}
  .delete(
    "/:id",
    async ({ params, currentUser, set }) => {
      await recipesService.delete(params.id, currentUser);
      set.status = 204;
    },
    {
      params: RecipeIdParams,
      response: { 204: t.Void() },
      detail: {
        tags: ["Recipes"],
        summary: "Delete recipe",
        description: "Hard delete + cascade + storage cleanup (AC M3-7, ADR-009).",
      },
    },
  )

  // POST /recipes/{id}/media
  .post(
    "/:id/media",
    async ({ params, body, currentUser, set }) => {
      set.status = 201;
      return recipesService.addMedia(params.id, body, currentUser);
    },
    {
      params: RecipeIdParams,
      body: AddMediaDTO,
      response: { 201: MediaResponseDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Upload media",
        description:
          "multipart. Second video → 409 VIDEO_LIMIT; a new is_cover=true unsets the previous cover.",
      },
    },
  )

  // DELETE /recipes/{id}/media/{mediaId}
  .delete(
    "/:id/media/:mediaId",
    async ({ params, currentUser, set }) => {
      await recipesService.deleteMedia(params.id, params.mediaId, currentUser);
      set.status = 204;
    },
    {
      params: MediaIdParams,
      response: { 204: t.Void() },
      detail: {
        tags: ["Recipes"],
        summary: "Delete media",
        description:
          "Also removes the file from the bucket. Removing the cover of a published recipe → 400 INCOMPLETE_RECIPE.",
      },
    },
  )

  // PUT /recipes/{id}/steps/{stepNumber}/image
  .put(
    "/:id/steps/:stepNumber/image",
    ({ params, body, currentUser }) =>
      recipesService.putStepImage(params.id, params.stepNumber, body.file, currentUser),
    {
      params: StepImageParams,
      body: StepImageBodyDTO,
      response: { 200: StepImageResponseDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Set step image",
        description: "One image per step; replaces (and deletes) the existing file.",
      },
    },
  );
