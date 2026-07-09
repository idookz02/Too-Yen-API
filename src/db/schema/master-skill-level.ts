import { bigint, boolean, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// ===== Master data (ADR-003 soft delete, ADR-004 separate tables) =====

export const masterSkillLevel = pgTable("master_skill_level", {
  skillLevelId: bigint("skill_level_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
