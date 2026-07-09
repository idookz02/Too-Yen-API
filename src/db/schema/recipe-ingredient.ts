import {
  bigint,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
} from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { ingredient } from "./ingredient";
import { unit } from "./unit";

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .notNull()
      .references(() => ingredient.ingredientId, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    unitId: bigint("unit_id", { mode: "number" }).references(
      () => unit.unitId,
      { onDelete: "restrict" },
    ),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.ingredientId] }),
    index("idx_recipe_ingredient_reverse").on(t.ingredientId), // advanced search filter
  ],
);
