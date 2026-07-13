import { bigint, boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const masterEquipment = pgTable("master_equipment", {
  equipmentId: bigint("equipment_id", { mode: "number" })
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
