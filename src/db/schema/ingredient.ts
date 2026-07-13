import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// ===== Ingredient / Unit (ADR-001, ADR-007) =====
// Ingredient is a master (admin CRUD + soft delete via is_active, ADR-003),
// still find-or-created from free-text ingredient name on recipe save (ADR-001).

export const ingredient = pgTable(
  "ingredient",
  {
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 150 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // case-insensitive dedupe
    uniqueIndex("uq_ingredient_name").on(sql`lower(${t.name})`),
  ],
);
