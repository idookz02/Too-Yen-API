-- 007 — multi cooking-method per recipe (2026-07-17).
-- A recipe can now carry more than one cooking method. Moves the single
-- recipe.cooking_method_id FK into a recipe_cooking_method junction (mirrors
-- recipe_equipment). Order is load-bearing: create + backfill BEFORE dropping
-- the column, or the existing values are lost.
--
-- ⚠️ Destructive: drops recipe.cooking_method_id. Review + back up before
-- applying to production. Not yet applied to the deployed DB.

-- 1. junction table
create table if not exists recipe_cooking_method (
  recipe_id         bigint not null references recipe (recipe_id) on delete cascade,
  cooking_method_id bigint not null references master_cooking_method (cooking_method_id) on delete restrict,
  primary key (recipe_id, cooking_method_id)
);

create index if not exists idx_recipe_cooking_method_reverse
  on recipe_cooking_method (cooking_method_id);

-- 2. backfill from the existing single column
insert into recipe_cooking_method (recipe_id, cooking_method_id)
select recipe_id, cooking_method_id
from recipe
where cooking_method_id is not null
on conflict do nothing;

-- 3. drop the old column (after the backfill)
alter table recipe drop column if exists cooking_method_id;
