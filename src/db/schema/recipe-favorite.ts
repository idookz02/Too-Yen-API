import { bigint, index, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { users } from "./users";

export const recipeFavorite = pgTable(
  "recipe_favorite",
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
  (t) => [
    primaryKey({ columns: [t.recipeId, t.userId] }),
    index("idx_favorite_user").on(t.userId, t.createdAt.desc()), // saved list
  ],
);
