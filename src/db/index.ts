/**
 * postgres.js + Drizzle init from DATABASE_URL (service role — ADR-010).
 * Never use the Supabase anon key. No migrations from the app.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/environment";
import * as schema from "./schema";

// Session pooler (5432): prepared statements OK.
// If you switch to the transaction pooler (6543), set prepare: false.
const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export type Db = typeof db;

/**
 * Tx — the transaction handle passed into db.transaction(async (tx) => ...).
 * Repositories accept `Executor` so a method works with either `db` or a `tx`.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Executor — "thing that can run queries": either the pool (db) or a tx. */
export type Executor = Db | Tx;

export { schema };
