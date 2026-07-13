import { sql } from "drizzle-orm";
import { bigint, check, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { masterTier } from "./master-tier";

// ===== Users =====

export const users = pgTable(
  "users",
  {
    userId: bigint("user_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    profilePicturePath: varchar("profile_picture_path", { length: 500 }),
    role: text("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }) // set_updated_at() trigger
      .notNull()
      .defaultNow(),
    // added by 003_user_tier.sql; set by DB trigger on insert (ADR-012)
    tierId: bigint("tier_id", { mode: "number" }).references(
      () => masterTier.tierId,
      { onDelete: "restrict" },
    ),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('user','admin')`)],
);
