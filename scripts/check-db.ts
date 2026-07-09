/**
 * Step 1 "Done when" scratch script — select from users against the real DB.
 * Run: bun run db:check   (needs DATABASE_URL in .env)
 */
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

const rows = await db
  .select({
    userId: users.userId,
    email: users.email,
    username: users.username,
    tierId: users.tierId,
  })
  .from(users)
  .limit(5);

console.log(`✅ Connected. users rows (max 5):`, rows);
process.exit(0);
