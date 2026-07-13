import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { recipe } from "./recipe";

// ===== Media (ADR-009) =====

export const recipeMedia = pgTable(
  "recipe_media",
  {
    mediaId: bigint("media_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull(),
    bucket: varchar("bucket", { length: 100 }).notNull(),
    objectPath: varchar("object_path", { length: 500 }).notNull(),
    isCover: boolean("is_cover").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "recipe_media_media_type_check",
      sql`${t.mediaType} in ('image','video')`,
    ),
    index("idx_recipe_media_recipe").on(t.recipeId),
  ],
);
