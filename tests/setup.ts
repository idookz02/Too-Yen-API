/**
 * Test preload (see bunfig.toml).
 *
 * Feature modules import the db client (src/db/index.ts), which reads
 * DATABASE_URL at load time. Provide a dummy so the import graph loads with no
 * real .env — postgres.js connects lazily, so no socket opens unless a test
 * actually runs a query. Real values (if present in the env) win via `??=`.
 */
process.env.DATABASE_URL ??=
  "postgresql://user:pass@localhost:5432/too_yen_test";
