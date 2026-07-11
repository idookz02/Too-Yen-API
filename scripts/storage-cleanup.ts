/**
 * Storage orphan cleanup (Step 9, implementation-plan Phase 8) — lists every
 * object per bucket, diffs against the paths referenced in the DB
 * (recipe_media.object_path, cooking_step.image_path, comment.image_path,
 * users.profile_picture_path) and removes the unreferenced ones — e.g. images
 * of soft-deleted comments or files left behind by crashed uploads.
 *
 * DRY-RUN by default (prints what would be deleted).
 * Run: bun run storage:cleanup            # dry run
 *      bun run storage:cleanup -- --apply # actually delete
 */
import { createClient } from "@supabase/supabase-js";
import { isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { comment, cookingStep, recipeMedia, users } from "../src/db/schema";
import { BUCKETS, type Bucket } from "../src/shared/services/storage.service";
import { env } from "../src/config/environment";

const APPLY = process.argv.includes("--apply");
const log = (msg: string) => console.log(`[cleanup] ${msg}`);

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Recursive walk — our paths are `{owner}/{uuid}.{ext}`, one folder level. */
async function listAllObjects(bucket: Bucket, prefix = ""): Promise<string[]> {
  const { data, error } = await client.storage
    .from(bucket)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`);

  const paths: string[] = [];
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      paths.push(...(await listAllObjects(bucket, full))); // folder
    } else {
      paths.push(full);
    }
  }
  return paths;
}

/** Every storage path the DB still references, grouped by bucket. */
async function referencedPaths(): Promise<Record<Bucket, Set<string>>> {
  const media = await db
    .select({ bucket: recipeMedia.bucket, path: recipeMedia.objectPath })
    .from(recipeMedia);
  const steps = await db
    .select({ path: cookingStep.imagePath })
    .from(cookingStep)
    .where(isNotNull(cookingStep.imagePath));
  const comments = await db
    .select({ path: comment.imagePath })
    .from(comment)
    .where(isNotNull(comment.imagePath)); // includes soft-deleted rows on purpose? NO —
  // soft-deleted comments are invisible forever, their images are orphans by design,
  // but the row still references the path. We treat rows (deleted or not) as referenced
  // to stay conservative; flip the filter here if you want to reap them.
  const avatars = await db
    .select({ path: users.profilePicturePath })
    .from(users)
    .where(isNotNull(users.profilePicturePath));

  const refs: Record<Bucket, Set<string>> = {
    [BUCKETS.recipeMedia]: new Set(),
    [BUCKETS.avatars]: new Set(),
    [BUCKETS.commentImages]: new Set(),
  };
  for (const m of media) refs[m.bucket as Bucket]?.add(m.path);
  for (const s of steps) refs[BUCKETS.recipeMedia].add(s.path!);
  for (const c of comments) refs[BUCKETS.commentImages].add(c.path!);
  for (const a of avatars) refs[BUCKETS.avatars].add(a.path!);
  return refs;
}

async function main() {
  log(APPLY ? "APPLY mode — orphans WILL be deleted" : "dry-run (pass --apply to delete)");
  const refs = await referencedPaths();

  let totalOrphans = 0;
  for (const bucket of Object.values(BUCKETS)) {
    const objects = await listAllObjects(bucket);
    const orphans = objects.filter((p) => !refs[bucket].has(p));
    log(`${bucket}: ${objects.length} objects, ${refs[bucket].size} referenced, ${orphans.length} orphans`);
    totalOrphans += orphans.length;

    for (const p of orphans) log(`  orphan: ${bucket}/${p}`);
    if (APPLY && orphans.length > 0) {
      for (let i = 0; i < orphans.length; i += 100) {
        const chunk = orphans.slice(i, i + 100);
        const { error } = await client.storage.from(bucket).remove(chunk);
        if (error) throw new Error(`remove in ${bucket} failed: ${error.message}`);
      }
      log(`  deleted ${orphans.length} orphan(s) from ${bucket}`);
    }
  }

  log(`done — ${totalOrphans} orphan(s) ${APPLY ? "deleted" : "found (not deleted)"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[cleanup] failed:", err);
  process.exit(1);
});
