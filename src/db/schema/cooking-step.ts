import {
  bigint,
  integer,
  pgTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { recipe } from "./recipe";

// ===== Cooking steps =====

export const cookingStep = pgTable(
  "cooking_step",
  {
    stepId: bigint("step_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    instruction: text("instruction").notNull(),
    imagePath: varchar("image_path", { length: 500 }), // Supabase object path (ADR-009)
  },
  (t) => [
    unique("cooking_step_recipe_id_step_number_key").on(
      t.recipeId,
      t.stepNumber,
    ),
  ],
);
