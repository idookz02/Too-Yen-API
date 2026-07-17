import { bigint, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { masterCookingMethod } from "./master-cooking-method";

// ===== Cooking-method junction (multi cooking methods per recipe) =====
// A recipe can carry more than one cooking method (mirrors recipe_equipment).

export const recipeCookingMethod = pgTable(
  "recipe_cooking_method",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    cookingMethodId: bigint("cooking_method_id", { mode: "number" })
      .notNull()
      .references(() => masterCookingMethod.cookingMethodId, {
        onDelete: "restrict",
      }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.cookingMethodId] }),
    index("idx_recipe_cooking_method_reverse").on(t.cookingMethodId),
  ],
);
