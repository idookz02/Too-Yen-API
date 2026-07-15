-- 005 — recipe.updated_at safety-net trigger (2026-07-15).
-- recipe.updated_at was app-maintained (repo.updateRecipe sets it explicitly),
-- so 004 skipped it. Adding the shared BEFORE UPDATE trigger anyway as defense
-- in depth: a raw UPDATE that bypasses the repo now still stamps updated_at.
-- Idempotent with the app path (both set now()). comment gets the same
-- treatment in 006.

drop trigger if exists trg_recipe_updated_at on recipe;
create trigger trg_recipe_updated_at
  before update on recipe
  for each row execute function set_updated_at();
