/**
 * Drizzle Kit config.
 *
 * ⚠️ ADR-010: the live Supabase DB is the source of truth and is already
 * populated; `src/db/schema/` mirrors it. Prefer `introspect`/`pull` to verify
 * the mirror. `generate`/`migrate` (out → ./drizzle) are wired for fresh or
 * branch databases only — do NOT push/migrate a generated initial schema onto
 * the production DB (it would try to recreate existing tables).
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
