import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const masterEquipment = pgTable(
  "master_equipment",
  {
    equipmentId: bigint("equipment_id", { mode: "number" })
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
  // case-insensitive dedupe, matching ingredient/unit — makes recipe-save
  // find-or-create race-safe (migration equipment_name_case_insensitive_unique)
  (t) => [uniqueIndex("uq_master_equipment_name").on(sql`lower(${t.name})`)],
);
