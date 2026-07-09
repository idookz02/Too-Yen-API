import { bigint, boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const masterCategory = pgTable("master_category", {
  categoryId: bigint("category_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
