-- 004 — add updated_at to every mutable table + a shared BEFORE UPDATE trigger
-- (2026-07-13). Append-only tables (recipe_like, recipe_favorite, recipe_*
-- junctions, recent_search) are intentionally left out: their rows are never
-- UPDATEd, so an updated_at would forever equal created_at.
-- recipe.updated_at + comment.updated_at already existed (app-maintained) and
-- are not touched here. (both later gained the same trigger as a safety net —
-- recipe in 005, comment in 006.)

-- shared trigger fn: stamp updated_at on every UPDATE (no drift, no app code)
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array[
    'master_skill_level','master_cooking_method','master_category',
    'master_equipment','master_tier','ingredient','unit','users','recipe_media'
  ] loop
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists trg_%I_updated_at on %I', t, t);
    execute format('create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
