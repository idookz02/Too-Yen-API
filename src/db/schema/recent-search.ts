import { bigint, pgTable, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

// ===== Recent search =====

export const recentSearch = pgTable(
  "recent_search",
  {
    searchId: bigint("search_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 255 }).notNull(),
    searchedAt: timestamp("searched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("recent_search_user_id_keyword_key").on(t.userId, t.keyword),
  ],
);
