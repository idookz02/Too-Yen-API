-- Too-Yen schema v1 — per data-dictionary.md (ADR-001..009)
-- Postgres / Supabase. BIGINT IDENTITY PKs, own users table (no Supabase Auth).

create table users (
  user_id bigint generated always as identity primary key,
  email varchar(255) not null unique,
  username varchar(100) not null unique,
  password_hash varchar(255) not null,
  display_name varchar(100) not null,
  profile_picture_path varchar(500),
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

-- ===== Master data (ADR-003 soft delete, ADR-004 separate tables) =====
create table master_skill_level (
  skill_level_id bigint generated always as identity primary key,
  name varchar(100) not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table master_cooking_method (
  cooking_method_id bigint generated always as identity primary key,
  name varchar(100) not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table master_category (
  category_id bigint generated always as identity primary key,
  name varchar(100) not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table master_equipment (
  equipment_id bigint generated always as identity primary key,
  name varchar(100) not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ===== Recipe (ADR-005) =====
create table recipe (
  recipe_id bigint generated always as identity primary key,
  user_id bigint not null references users(user_id) on delete restrict,
  recipe_name varchar(255),
  description text, -- nullable while draft, required at publish (app-enforced)
  skill_level_id bigint references master_skill_level(skill_level_id) on delete restrict,
  cook_time_minutes int, -- ADR-011: user-entered minutes, range filter in search
  cooking_method_id bigint references master_cooking_method(cooking_method_id) on delete restrict,
  category_id bigint references master_category(category_id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','published','private')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_recipe_feed on recipe (status, published_at desc);
create index idx_recipe_owner on recipe (user_id);

-- ===== Ingredient / Unit (ADR-001, ADR-007) =====
create table ingredient (
  ingredient_id bigint generated always as identity primary key,
  name varchar(150) not null,
  created_at timestamptz not null default now()
);
create unique index uq_ingredient_name on ingredient (lower(name)); -- case-insensitive dedupe

create table unit (
  unit_id bigint generated always as identity primary key,
  name varchar(50) not null,
  created_at timestamptz not null default now()
);
create unique index uq_unit_name on unit (lower(name));

create table recipe_ingredient (
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  ingredient_id bigint not null references ingredient(ingredient_id) on delete restrict,
  amount numeric(10,2),
  unit_id bigint references unit(unit_id) on delete restrict,
  sort_order int not null,
  primary key (recipe_id, ingredient_id)
);
create index idx_recipe_ingredient_reverse on recipe_ingredient (ingredient_id); -- advanced search filter

-- ===== Equipment junction (ADR-002) =====
create table recipe_equipment (
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  equipment_id bigint not null references master_equipment(equipment_id) on delete restrict,
  primary key (recipe_id, equipment_id)
);
create index idx_recipe_equipment_reverse on recipe_equipment (equipment_id);

-- ===== Cooking steps =====
create table cooking_step (
  step_id bigint generated always as identity primary key,
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  step_number int not null,
  instruction text not null,
  image_path varchar(500), -- Supabase object path (ADR-009)
  unique (recipe_id, step_number)
);

-- ===== Media (ADR-009) =====
create table recipe_media (
  media_id bigint generated always as identity primary key,
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  bucket varchar(100) not null,
  object_path varchar(500) not null,
  is_cover boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_recipe_media_recipe on recipe_media (recipe_id);

-- ===== Comment (ADR-006, ADR-008) =====
create table comment (
  comment_id bigint generated always as identity primary key,
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  user_id bigint not null references users(user_id) on delete restrict,
  comment_text text not null,
  image_path varchar(500), -- 1 attached image (ADR-009)
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index idx_comment_recipe on comment (recipe_id, created_at desc);

-- ===== Engagement (ADR-006, ADR-008: counts via COUNT, no denormalization) =====
create table recipe_like (
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  user_id bigint not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create table recipe_favorite (
  recipe_id bigint not null references recipe(recipe_id) on delete cascade,
  user_id bigint not null references users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index idx_favorite_user on recipe_favorite (user_id, created_at desc); -- saved list

-- ===== Recent search =====
create table recent_search (
  search_id bigint generated always as identity primary key,
  user_id bigint not null references users(user_id) on delete cascade,
  keyword varchar(255) not null,
  searched_at timestamptz not null default now(),
  unique (user_id, keyword)
);
