/**
 * ⚠️ For `drizzle-kit introspect`/`pull` ONLY (verify schema.ts vs live DB).
 * NEVER run push/generate/migrate — the Supabase DB is the source of truth.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
