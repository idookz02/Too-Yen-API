import { Elysia } from "elysia";
import { authPlugin } from "../../shared/plugins/auth.plugin";
import { recipesService } from "./services/recipes.service";
import {
  AddMediaDTO,
  FeedQueryDTO,
  FeedResponseDTO,
  MediaIdParams,
  MediaResponseDTO,
  RecipeDetailDTO,
  RecipeIdParams,
  StepImageBodyDTO,
  StepImageParams,
  StepImageResponseDTO,
  UpsertRecipeDTO,
  VisibilityDTO,
} from "./dto/recipes.dto";

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

  // POST /recipes — create draft (partial fields allowed)
  .post(
    "/",
    async ({ body, currentUser, set }) => {
      set.status = 201;
      return recipesService.create(body, currentUser);
    },
    {
      body: UpsertRecipeDTO,
      response: { 201: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Create draft",
        description:
          "Save Draft works with incomplete fields (AC M1-5). ingredients[].name/unit_name are " +
          "find-or-created case-insensitively (ADR-001/007).",
      },
    },
  )

  // PATCH /recipes/{id} — edit (arrays replace the whole set)
  .patch(
    "/:id",
    ({ params, body, currentUser }) => recipesService.update(params.id, body, currentUser),
    {
      params: RecipeIdParams,
      body: UpsertRecipeDTO,
      response: { 200: RecipeDetailDTO },
      detail: {
        tags: ["Recipes"],
        summary: "Edit recipe",
        description:
          "Owner only. On a published recipe the update must not break completeness " +
          "(400 INCOMPLETE_RECIPE with details[]).",
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
