import {
  bigint,
  boolean,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ADR-012: user tier from total likes across own recipes
export const masterTier = pgTable("master_tier", {
  tierId: bigint("tier_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  minLikes: integer("min_likes").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
    .notNull()
    .defaultNow(),
});
