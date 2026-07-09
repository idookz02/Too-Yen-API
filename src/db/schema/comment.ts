import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { users } from "./users";

// ===== Comment (ADR-006, ADR-008) =====

export const comment = pgTable(
  "comment",
  {
    commentId: bigint("comment_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    commentText: text("comment_text").notNull(),
    imagePath: varchar("image_path", { length: 500 }), // 1 attached image (ADR-009)
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }), // nullable — set on edit
  },
  (t) => [index("idx_comment_recipe").on(t.recipeId, t.createdAt.desc())],
);
