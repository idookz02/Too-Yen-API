/**
 * Schema barrel — re-exports every entity table (one file per table).
 * Drizzle-kit reads this folder (see drizzle.config.ts).
 *
 * This schema is the authoritative definition (ADR-010 amendment); schema
 * changes flow code → `db:generate` → `db:migrate`. It was first deployed from
 * doc/supabase/001_schema.sql + doc/supabase/003_user_tier.sql
 * (17 tables per doc/data-dictionary-en.md).
 */
export * from "./master-skill-level";
export * from "./master-cooking-method";
export * from "./master-category";
export * from "./master-equipment";
export * from "./master-tier";
export * from "./users";
export * from "./recipe";
export * from "./ingredient";
export * from "./unit";
export * from "./recipe-ingredient";
export * from "./recipe-equipment";
export * from "./cooking-step";
export * from "./recipe-media";
export * from "./comment";
export * from "./recipe-like";
export * from "./recipe-favorite";
export * from "./recent-search";
