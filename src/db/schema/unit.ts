import { sql } from "drizzle-orm";
import { bigint, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const unit = pgTable(
  "unit",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_unit_name").on(sql`lower(${t.name})`)],
);
