import { bigint, boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const masterCookingMethod = pgTable("master_cooking_method", {
  cookingMethodId: bigint("cooking_method_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
    .notNull()
    .defaultNow(),
});
