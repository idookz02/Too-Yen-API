import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { masterSkillLevel } from "./master-skill-level";
import { masterCookingMethod } from "./master-cooking-method";
import { masterCategory } from "./master-category";

// ===== Recipe (ADR-005 single table + status) =====

export const recipe = pgTable(
  "recipe",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    recipeName: varchar("recipe_name", { length: 255 }),
    description: text("description"), // nullable while draft, required at publish (app-enforced)
    skillLevelId: bigint("skill_level_id", { mode: "number" }).references(
      () => masterSkillLevel.skillLevelId,
      { onDelete: "restrict" },
    ),
    cookTimeMinutes: integer("cook_time_minutes"), // ADR-011: user-entered minutes
    servings: integer("servings"), // how many servings the recipe yields (nullable, like cook_time)
    cookingMethodId: bigint("cooking_method_id", { mode: "number" }).references(
      () => masterCookingMethod.cookingMethodId,
      { onDelete: "restrict" },
    ),
    categoryId: bigint("category_id", { mode: "number" }).references(
      () => masterCategory.categoryId,
      { onDelete: "restrict" },
    ),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "recipe_status_check",
      sql`${t.status} in ('draft','published','private')`,
    ),
    index("idx_recipe_feed").on(t.status, t.publishedAt.desc()),
    index("idx_recipe_owner").on(t.userId),
  ],
);
