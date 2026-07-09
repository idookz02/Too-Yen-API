/**
 * Migration runner — applies SQL files in ./drizzle to DATABASE_URL.
 * Run: bun run db:migrate
 *
 * ⚠️ ADR-010: the Supabase DB is the source of truth and is ALREADY populated.
 * `src/db/schema` is a mirror of it. Do NOT `drizzle-kit generate` an initial
 * migration and apply it blindly — it would try to recreate existing tables.
 * Only run this against a fresh/branch database, or with migrations you have
 * reviewed by hand.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/environment";

const main = async () => {
  console.log("⏳ Running migrations...");
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("✅ Migrations complete.");
};

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
