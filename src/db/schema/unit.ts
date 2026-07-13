import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

// Unit is a master (admin CRUD + soft delete via is_active, ADR-003), while
// still find-or-created from free-text unit_name on recipe save (ADR-007).
export const unit = pgTable(
  "unit",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_unit_name").on(sql`lower(${t.name})`)],
);
