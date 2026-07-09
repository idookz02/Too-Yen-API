/**
 * @deprecated Schema moved to the src/db/schema/ folder (one file per table).
 * This file is kept only so existing `import ... from "./schema"` / "../db/schema"
 * paths keep resolving. Import from "./schema" as before — it re-exports the folder.
 */
export * from "./schema/index";
