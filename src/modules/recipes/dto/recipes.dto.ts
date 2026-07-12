import { t } from "elysia";
import { PaginationQueryDTO } from "../../../shared/utils/pagination";

// ============================================================================
// Request DTOs (doc/api/03-recipes.md)
// ============================================================================

export const RECIPE_SORTS = ["newest", "most_liked", "most_favorited"] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

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

const IngredientInputDTO = t.Object({
  name: t.String({ minLength: 1, maxLength: 150, examples: ["Shrimp"] }),
  amount: t.Optional(t.Number({ minimum: 0, examples: [300] })),
  unit_name: t.Optional(t.String({ minLength: 1, maxLength: 50, examples: ["gram"] })),
});

const StepInputDTO = t.Object({
  step_number: t.Integer({ minimum: 1 }),
  instruction: t.String({ minLength: 1 }),
});

/** POST /recipes — draft; every field optional (AC M1-5). PATCH reuses this. */
export const UpsertRecipeDTO = t.Object({
  recipe_name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ minLength: 1 })),
  cook_time_minutes: t.Optional(t.Integer({ minimum: 1 })),
  skill_level_id: t.Optional(t.Integer({ minimum: 1 })),
  cooking_method_id: t.Optional(t.Integer({ minimum: 1 })),
  category_id: t.Optional(t.Integer({ minimum: 1 })),
  equipment_ids: t.Optional(t.Array(t.Integer({ minimum: 1 }))),
  ingredients: t.Optional(t.Array(IngredientInputDTO)),
  steps: t.Optional(t.Array(StepInputDTO)),
});
export type UpsertRecipeInput = typeof UpsertRecipeDTO.static;

/**
 * POST / PATCH /recipes — multipart (decision 2026-07-10, replaces the JSON
 * body): `data` = JSON string matching UpsertRecipeDTO, plus optional files
 * `cover` and `step_image_{n}` (n = step_number in data.steps), plus
 * `publish=true` (create only) to validate + publish in the same request.
 * step_image_{n} keys are dynamic — validated in the service.
 */
export const MultipartRecipeBodyDTO = t.Object(
  {
    // Elysia auto-parses JSON-looking form values into objects BEFORE validation
    // (found by the live smoke run 2026-07-10) — accept both: the parsed object,
    // or a raw string (e.g. malformed JSON, which the service rejects with a 400)
    data: t.Optional(
      t.Union([
        UpsertRecipeDTO,
        t.String({ description: "JSON string with the recipe fields (old JSON body)" }),
      ]),
    ),
    cover: t.Optional(t.File({ type: "image" })),
    publish: t.Optional(
      t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]),
    ),
  },
  // additionalProperties keeps the dynamic step_image_{n} File fields — without
  // it Elysia strips unknown multipart keys and step images silently vanish
  { additionalProperties: true },
);

export const VisibilityDTO = t.Object({
  status: t.Union([t.Literal("published"), t.Literal("private")]),
});
export type VisibilityInput = typeof VisibilityDTO.static;

/** POST /recipes/{id}/media — multipart. is_cover arrives as a string field. */
export const AddMediaDTO = t.Object({
  file: t.File(),
  type: t.Union([t.Literal("image"), t.Literal("video")]),
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
  status: t.String(),
  published_at: NullableString,
});

export const RecipeDetailDTO = t.Composite([
  RecipeCardDTO,
  t.Object({
    description: NullableString,
    cook_time_minutes: NullableNumber,
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
        type: t.String(),
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
  type: t.String(),
  url: t.String(),
  is_cover: t.Boolean(),
  sort_order: t.Number(),
});

export const StepImageResponseDTO = t.Object({
  step_number: t.Number(),
  image_url: t.String(),
});
