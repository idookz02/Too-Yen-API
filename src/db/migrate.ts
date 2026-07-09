/**
 * Migration runner — applies SQL files in ./drizzle to DATABASE_URL.
 * Run: bun run db:migrate   (ADR-010 amendment: schema is managed in code)
 *
 * Workflow: edit src/db/schema/ → `bun run db:generate` → review the SQL → run
 * this. Always review generated SQL before applying.
 *
 * ⚠️ The production DB is already deployed (17 tables). Applying a freshly
 * generated INITIAL migration to it will fail (CREATE on existing tables) —
 * baseline the deployed DB first (mark the initial migration as already
 * applied in Drizzle's __drizzle_migrations journal). See ADR-010 amendment.
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
