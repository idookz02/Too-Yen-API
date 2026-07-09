-- ADR-012: user tier from total likes across own recipes (applied as migration add_user_tier)
create table public.master_tier (
  tier_id bigint generated always as identity primary key,
  name varchar(100) not null unique,
  min_likes int not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.master_tier enable row level security;

alter table public.users
  add column tier_id bigint references public.master_tier(tier_id) on delete restrict;

create or replace function public.recalc_user_tier(p_user_id bigint)
returns void language sql security definer set search_path = public as $$
  update users u
  set tier_id = (
    select t.tier_id
    from master_tier t
    where t.is_active
      and t.min_likes <= (
        select count(*)
        from recipe_like rl
        join recipe r on r.recipe_id = rl.recipe_id
        where r.user_id = p_user_id
      )
    order by t.min_likes desc
    limit 1
  )
  where u.user_id = p_user_id;
$$;

create or replace function public.trg_like_tier()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner bigint;
begin
  select r.user_id into v_owner
  from recipe r
  where r.recipe_id = coalesce(new.recipe_id, old.recipe_id);
  if v_owner is not null then
    perform recalc_user_tier(v_owner);
  end if;
  return null;
end $$;

create trigger recipe_like_tier
after insert or delete on public.recipe_like
for each row execute function public.trg_like_tier();

create or replace function public.trg_recipe_delete_tier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalc_user_tier(old.user_id);
  return null;
end $$;

create trigger recipe_delete_tier
after delete on public.recipe
for each row execute function public.trg_recipe_delete_tier();

create or replace function public.trg_user_insert_tier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recalc_user_tier(new.user_id);
  return null;
end $$;

create trigger user_insert_tier
after insert on public.users
for each row execute function public.trg_user_insert_tier();

-- Suggested seed (run when ready):
-- insert into master_tier (name, min_likes) values ('Bronze', 0), ('Silver', 100), ('Gold', 500);
-- select recalc_user_tier(user_id) from users; -- recalc everyone after editing tiers
