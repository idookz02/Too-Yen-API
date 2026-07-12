/**
 * Test preload (see bunfig.toml).
 *
 * Feature modules import the db client (src/db/index.ts), which reads
 * DATABASE_URL at load time. Provide a dummy so the import graph loads with no
 * real .env — postgres.js connects lazily, so no socket opens unless a test
 * actually runs a query. Real values (if present in the env) win via `??=`.
 */
// FORCE overrides (not ??=): once a real .env exists Bun auto-loads it into
// bun test, and a conditional default would silently point the entire test
// suite at the LIVE database (it did — leaked draft rows on 2026-07-10).
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/too_yen_test";
process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";
process.env.JWT_SECRET = "test-secret-not-for-production";
// a real key here would make vision tests call OpenAI for real (it did — 429)
delete process.env.OPENAI_API_KEY;
