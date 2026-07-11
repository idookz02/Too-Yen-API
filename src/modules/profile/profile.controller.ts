import { Elysia } from "elysia";
import { authPlugin } from "../../shared/plugins/auth.plugin";
import { PaginationQueryDTO } from "../../shared/utils/pagination";
import { profileService } from "./services/profile.service";
import {
  AvatarBodyDTO,
  AvatarResponseDTO,
  CardListResponseDTO,
  MeResponseDTO,
  OwnRecipesQueryDTO,
  UpdateMeDTO,
} from "./dto/profile.dto";

/** Module 2 — Profile (doc/api/02-profile.md). All routes require Bearer auth. */
export const profileController = new Elysia({ prefix: "/users/me" })
  .use(authPlugin)

  // GET /users/me
  .get("/", ({ currentUser }) => profileService.me(currentUser), {
    response: { 200: MeResponseDTO },
    detail: {
      tags: ["Profile"],
      summary: "My profile",
      description: "Tier (with min_likes) + total_likes_received across own recipes.",
    },
  })

  // PATCH /users/me — display_name / password only
  .patch("/", ({ body, currentUser }) => profileService.update(body, currentUser), {
    body: UpdateMeDTO,
    response: { 200: MeResponseDTO },
    detail: {
      tags: ["Profile"],
      summary: "Edit profile",
      description:
        "username is immutable (AC 6). Password shorter than 8 chars → 400 PASSWORD_POLICY_VIOLATION.",
    },
  })

  // PUT /users/me/avatar
  .put(
    "/avatar",
    ({ body, currentUser }) => profileService.updateAvatar(body.file, currentUser),
    {
      body: AvatarBodyDTO,
      response: { 200: AvatarResponseDTO },
      detail: {
        tags: ["Profile"],
        summary: "Replace avatar",
        description: "Uploads the new picture and deletes the old file (ADR-009).",
      },
    },
  )

  // GET /users/me/saved-recipes
  .get(
    "/saved-recipes",
    ({ query, currentUser }) => profileService.savedRecipes(query, currentUser),
    {
      query: PaginationQueryDTO,
      response: { 200: CardListResponseDTO },
      detail: {
        tags: ["Profile"],
        summary: "Saved recipes",
        description:
          "Favorited posts, latest save first (AC 5); other users' private posts are filtered out.",
      },
    },
  )

  // GET /users/me/drafts
  .get(
    "/drafts",
    ({ query, currentUser }) => profileService.drafts(query, currentUser),
    {
      query: PaginationQueryDTO,
      response: { 200: CardListResponseDTO },
      detail: {
        tags: ["Profile"],
        summary: "My drafts",
        description: "Own drafts, most recently edited first.",
      },
    },
  )

  // GET /users/me/recipes?status=
  .get(
    "/recipes",
    ({ query, currentUser }) => profileService.ownRecipes(query, currentUser),
    {
      query: OwnRecipesQueryDTO,
      response: { 200: CardListResponseDTO },
      detail: {
        tags: ["Profile"],
        summary: "My posts",
        description:
          "Own published/private posts; omit status for both (drafts live at /users/me/drafts).",
      },
    },
  );
