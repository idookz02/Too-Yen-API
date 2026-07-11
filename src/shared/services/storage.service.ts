/**
 * Supabase Storage access (service role — ADR-009/010).
 * Buckets + path conventions from implementation-plan Phase 1:
 *   recipe-media/{recipe_id}/{uuid}.{ext}
 *   avatars/{user_id}/{uuid}.{ext}
 *   comment-images/{comment_id}/{uuid}.{ext}
 * Client is created lazily so importing this file needs no env vars.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/environment";

export const BUCKETS = {
  recipeMedia: "recipe-media",
  avatars: "avatars",
  commentImages: "comment-images",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

let client: SupabaseClient | null = null;
const getClient = () =>
  (client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }));

/** `{ownerId}/{uuid}.{ext}` — ext from the uploaded file name (fallback: mime subtype). */
export function buildObjectPath(ownerId: number | string, file: File): string {
  const fromName = file.name?.includes(".") ? file.name.split(".").pop() : undefined;
  const fromMime = file.type?.split("/").pop();
  const ext = (fromName || fromMime || "bin").toLowerCase();
  return `${ownerId}/${crypto.randomUUID()}.${ext}`;
}

export class StorageService {
  /** Upload a file; returns the object path to persist in the DB (ADR-009). */
  async upload(bucket: Bucket, path: string, file: File): Promise<string> {
    const { error } = await getClient()
      .storage.from(bucket)
      .upload(path, file, { contentType: file.type || undefined });
    if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
    return path;
  }

  /** Remove objects; no-op for an empty list. */
  async remove(bucket: Bucket, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await getClient().storage.from(bucket).remove(paths);
    if (error) throw new Error(`Storage remove failed (${bucket}): ${error.message}`);
  }

  /** Public URL for a stored object (buckets are public — ADR-009). */
  publicUrl(bucket: Bucket, path: string): string {
    return getClient().storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

export const storageService = new StorageService();
