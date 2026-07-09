import { sql } from "drizzle-orm";
import { bigint, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// ===== Ingredient / Unit (ADR-001, ADR-007) =====

export const ingredient = pgTable(
  "ingredient",
  {
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 150 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // case-insensitive dedupe
    uniqueIndex("uq_ingredient_name").on(sql`lower(${t.name})`),
  ],
);
