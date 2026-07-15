-- 006 — comment.updated_at safety-net trigger (2026-07-15).
-- Completes the set: comment was the last mutable table left app-only (its edit
-- path sets updated_at explicitly). Adds the shared BEFORE UPDATE trigger as
-- defense in depth, matching recipe (005) and the 004 tables. comment.updated_at
-- stays nullable (null = never edited); the trigger stamps now() on any UPDATE.

drop trigger if exists trg_comment_updated_at on comment;
create trigger trg_comment_updated_at
  before update on comment
  for each row execute function set_updated_at();
