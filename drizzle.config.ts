/**
 * Drizzle Kit config.
 *
 * Schema in `src/db/schema/` is authoritative (ADR-010 amendment): edit it,
 * `bun run db:generate` a migration into ./drizzle, review the SQL, then
 * `bun run db:migrate`.
 *
 * ⚠️ The production DB is already deployed (17 tables). Baseline it before
 * running an initial generated migration against prod, or `migrate` will try
 * to CREATE existing tables — see the ADR-010 amendment.
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
