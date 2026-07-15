import { t } from "elysia";
import { PaginationQueryDTO } from "../../../shared/utils/pagination";

// ============================================================================
// Request DTOs (doc/api/03-recipes.md)
// ============================================================================

export const RECIPE_SORTS = ["newest", "most_liked", "most_favorited"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

/** ADR-005 — recipe.status check constraint. Stored as plain `text` in the DB
 *  (see doc/supabase/001_schema.sql), so repositories read it back as
 *  `string` — callers assert this literal type at the DB boundary. */
export const RECIPE_STATUSES = ["draft", "published", "private"] as const;
export type RecipeStatus = (typeof RECIPE_STATUSES)[number];
const RecipeStatusDTO = t.Union([
  t.Literal("draft"),
  t.Literal("published"),
  t.Literal("private"),
]);

/** recipe_media.media_type check constraint — same DB-boundary note as above. */
export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
const MediaTypeDTO = t.Union([t.Literal("image"), t.Literal("video")]);

export const FeedQueryDTO = t.Composite([
  PaginationQueryDTO,
  t.Object({
    sort: t.Optional(
      t.Union(
        RECIPE_SORTS.map((s) => t.Literal(s)),
        { default: "newest" },
      ),
    ),
  }),
]);

export const RecipeIdParams = t.Object({ id: t.Numeric({ minimum: 1 }) });

/**
 * One recipe ingredient (decision 2026-07-15 — id-first for the dropdown UI).
 * Ingredient: send `ingredient_id` (picked from the master dropdown) OR `name`
 * (a new free-text name → find-or-created into the master, ADR-001). At least
 * one is required (enforced in the service). If both are sent, `ingredient_id`
 * wins and `name` is ignored. Unit follows the same rule via `unit_id`/
 * `unit_name`, but is fully optional (omit both → no unit). A not-found id → 400;
 * a soft-deleted id is reactivated and used (ADR-003).
 */
const IngredientInputDTO = t.Object({
  ingredient_id: t.Optional(t.Integer({ minimum: 1, examples: [5] })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 150, examples: ["Galangal"] })),
  amount: t.Optional(t.Number({ minimum: 0, examples: [300] })),
  unit_id: t.Optional(t.Integer({ minimum: 1, examples: [2] })),
  unit_name: t.Optional(t.String({ minLength: 1, maxLength: 50, examples: ["gram"] })),
});

/**
 * One recipe equipment (decision 2026-07-15 — id-first, same rule as ingredient).
 * Send `equipment_id` (dropdown pick) OR `name` (new → find-or-created into the
 * master, case-insensitive dedupe). At least one is required (enforced in the
 * service); id wins if both. A not-found id → 400; a soft-deleted id is
 * reactivated and used (ADR-003).
 */
const EquipmentInputDTO = t.Object({
  equipment_id: t.Optional(t.Integer({ minimum: 1, examples: [4] })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 100, examples: ["Air fryer"] })),
});

const StepInputDTO = t.Object({
  step_number: t.Integer({ minimum: 1 }),
  instruction: t.String({ minLength: 1 }),
  /** Multipart: name of the file part holding this step's image (decision
   *  2026-07-15, replaces the positional `step_image_{n}` key). Reserved names
   *  (data/cover/video/publish) are rejected in the service. */
  image_field: t.Optional(t.String({ minLength: 1, examples: ["step_img_1"] })),
});

/** POST /recipes — draft; every field optional (AC M1-5). PATCH reuses this. */
export const UpsertRecipeDTO = t.Object({
  recipe_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ minLength: 1 })),
  cook_time_minutes: t.Optional(t.Integer({ minimum: 1 })),
  servings: t.Optional(t.Integer({ minimum: 1, examples: [4] })),
  skill_level_id: t.Optional(t.Integer({ minimum: 1 })),
  cooking_method_id: t.Optional(t.Integer({ minimum: 1 })),
  category_id: t.Optional(t.Integer({ minimum: 1 })),
  equipment: t.Optional(t.Array(EquipmentInputDTO)),
  ingredients: t.Optional(t.Array(IngredientInputDTO)),
  steps: t.Optional(t.Array(StepInputDTO)),
});
export type UpsertRecipeInput = typeof UpsertRecipeDTO.static;

/**
 * POST / PATCH /recipes — multipart (decision 2026-07-10, step-image mapping
 * revised 2026-07-15): `data` = JSON string matching UpsertRecipeDTO, plus
 * optional files `cover`, `video`, and one file part per step named by that
 * step's `image_field` in data.steps, plus `publish=true` (create only) to
 * validate + publish in the same request. The step file parts have dynamic,
 * client-chosen names — resolved + validated in the service.
 */
export const MultipartRecipeBodyDTO = t.Object(
  {
    // Elysia auto-parses JSON-looking form values into objects BEFORE validation
    // (found by the live smoke run 2026-07-10) — accept both: the parsed object,
    // or a raw string (e.g. malformed JSON, which the service rejects with a 400)
    data: t.Optional(
      t.Union(
        [
          UpsertRecipeDTO,
          t.String({ description: "JSON string with the recipe fields (old JSON body)" }),
        ],
        {
          description:
            "JSON string of the recipe fields. Give each step an `image_field` = the name " +
            "of the form file part carrying its image (see the `step_img_1` part in the " +
            "example), then add that file part to the same request.",
          examples: [
            JSON.stringify(
              {
                recipe_name: "Tom Yum Goong",
                description: "Spicy Thai shrimp soup",
                cook_time_minutes: 30,
                servings: 4,
                skill_level_id: 1,
                cooking_method_id: 2,
                category_id: 3,
                equipment: [
                  { equipment_id: 4 }, // picked from the dropdown
                  { name: "Air fryer" }, // typed a new one → created in the master
                ],
                ingredients: [
                  // picked from the dropdown → send ids
                  { ingredient_id: 5, amount: 300, unit_id: 2 },
                  // typed a new one → send names; backend creates them in the master
                  { name: "Galangal", amount: 2, unit_name: "slice" },
                ],
                steps: [
                  { step_number: 1, instruction: "Boil the water", image_field: "step_img_1" },
                  { step_number: 2, instruction: "Add the shrimp", image_field: "step_img_2" },
                ],
              },
              null,
              2,
            ),
          ],
        },
      ),
    ),
    cover: t.Optional(t.File({ type: "image" })),
    video: t.Optional(t.File({ type: "video" })),
    // dynamic per-step image parts (named by each step's image_field) — declared
    // here only so Swagger UI renders file inputs for the example; the real keys
    // are client-chosen and kept via additionalProperties below
    step_img_1: t.Optional(t.File({ type: "image" })),
    step_img_2: t.Optional(t.File({ type: "image" })),
    publish: t.Optional(
      t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]),
    ),
  },
  // additionalProperties keeps the dynamic, client-named step image File parts —
  // without it Elysia strips unknown multipart keys and step images silently vanish
  { additionalProperties: true },
);

export const VisibilityDTO = t.Object({
  status: t.Union([t.Literal("published"), t.Literal("private")]),
});
export type VisibilityInput = typeof VisibilityDTO.static;

/** POST /recipes/{id}/media — multipart. is_cover arrives as a string field. */
export const AddMediaDTO = t.Object({
  file: t.File(),
  type: MediaTypeDTO,
  is_cover: t.Optional(
    t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]),
  ),
  sort_order: t.Optional(t.Numeric({ minimum: 0 })),
});
export type AddMediaInput = typeof AddMediaDTO.static;

export const MediaIdParams = t.Object({
  id: t.Numeric({ minimum: 1 }),
  mediaId: t.Numeric({ minimum: 1 }),
});

export const StepImageParams = t.Object({
  id: t.Numeric({ minimum: 1 }),
  stepNumber: t.Numeric({ minimum: 1 }),
});

export const StepImageBodyDTO = t.Object({ file: t.File({ type: "image" }) });

// ============================================================================
// Response DTOs
// ============================================================================

const NullableString = t.Union([t.String(), t.Null()]);
const NullableNumber = t.Union([t.Number(), t.Null()]);
const IdName = t.Object({ id: t.Number(), name: t.String() });
const NullableIdName = t.Union([IdName, t.Null()]);

export const RecipeCardDTO = t.Object({
  recipe_id: t.Number(),
  recipe_name: NullableString,
  cover_image_url: NullableString,
  author: t.Object({
    user_id: t.Number(),
    display_name: t.String(),
    tier_name: NullableString,
  }),
  like_count: t.Number(),
  favorite_count: t.Number(),
  comment_count: t.Number(),
  liked_by_me: t.Boolean(),
  favorited_by_me: t.Boolean(),
  is_owner: t.Boolean(),
  status: RecipeStatusDTO,
  published_at: NullableString,
});

export const RecipeDetailDTO = t.Composite([
  RecipeCardDTO,
  t.Object({
    description: NullableString,
    cook_time_minutes: NullableNumber,
    servings: NullableNumber,
    skill_level: NullableIdName,
    cooking_method: NullableIdName,
    category: NullableIdName,
    equipment: t.Array(IdName),
    ingredients: t.Array(
      t.Object({
        ingredient_id: t.Number(),
        name: t.String(),
        amount: NullableNumber,
        unit: NullableIdName,
        sort_order: t.Number(),
      }),
    ),
    steps: t.Array(
      t.Object({
        step_number: t.Number(),
        instruction: t.String(),
        image_url: NullableString,
      }),
    ),
    media: t.Array(
      t.Object({
        media_id: t.Number(),
        type: MediaTypeDTO,
        url: t.String(),
        is_cover: t.Boolean(),
        sort_order: t.Number(),
      }),
    ),
  }),
]);

export const FeedResponseDTO = t.Object({
  data: t.Array(RecipeCardDTO),
  pagination: t.Object({
    page: t.Number(),
    limit: t.Number(),
    total: t.Number(),
    total_pages: t.Number(),
  }),
});

export const MediaResponseDTO = t.Object({
  media_id: t.Number(),
  type: MediaTypeDTO,
  url: t.String(),
  is_cover: t.Boolean(),
  sort_order: t.Number(),
});

export const StepImageResponseDTO = t.Object({
  step_number: t.Number(),
  image_url: t.String(),
});
