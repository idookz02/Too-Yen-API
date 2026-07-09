import { bigint, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { users } from "./users";

// ===== Engagement (ADR-006, ADR-008: counts via COUNT, no denormalization) =====

export const recipeLike = pgTable(
  "recipe_like",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.userId] })],
);
