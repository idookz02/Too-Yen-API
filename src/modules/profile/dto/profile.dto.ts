import { t } from "elysia";
import { PaginationQueryDTO } from "../../../shared/utils/pagination";
import { RecipeCardDTO } from "../../recipes/dto/recipes.dto";

// ============================================================================
// Request DTOs (doc/api/02-profile.md)
// ============================================================================

/** PATCH /users/me — display_name / password only; username is immutable (AC 6). */
export const UpdateMeDTO = t.Object({
  display_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  // policy (min 8) enforced in the service so it maps to 400 PASSWORD_POLICY_VIOLATION
  password: t.Optional(t.String()),
});
export type UpdateMeInput = typeof UpdateMeDTO.static;

export const AvatarBodyDTO = t.Object({ file: t.File({ type: "image" }) });

export const OwnRecipesQueryDTO = t.Composite([
  PaginationQueryDTO,
  t.Object({
    // omitted -> both published + private (decision 2026-07-10); drafts have /drafts
    status: t.Optional(t.Union([t.Literal("published"), t.Literal("private")])),
  }),
]);

// ============================================================================
// Response DTOs
// ============================================================================

export const MeResponseDTO = t.Object({
  user_id: t.Number(),
  username: t.String(),
  display_name: t.String(),
  email: t.String({ format: "email" }),
  profile_picture_url: t.Union([t.String(), t.Null()]),
  role: t.Union([t.Literal("user"), t.Literal("admin")]),
  tier: t.Union([
    t.Object({ tier_id: t.Number(), name: t.String(), min_likes: t.Number() }),
    t.Null(),
  ]),
  total_likes_received: t.Number(),
  created_at: t.String({ format: "date-time" }),
});

export const AvatarResponseDTO = t.Object({ profile_picture_url: t.String() });

export const CardListResponseDTO = t.Object({
  data: t.Array(RecipeCardDTO),
  pagination: t.Object({
    page: t.Number(),
    limit: t.Number(),
    total: t.Number(),
    total_pages: t.Number(),
  }),
});
