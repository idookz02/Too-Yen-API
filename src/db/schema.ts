/**
 * Drizzle schema mirroring the EXISTING Supabase DB — source of truth:
 * doc/supabase/001_schema.sql + doc/supabase/003_user_tier.sql
 * (17 tables per doc/data-dictionary-en.md).
 *
 * ⚠️ NEVER run drizzle-kit push/migrate against this DB. Read-only mirror.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ===== Master data (ADR-003 soft delete, ADR-004 separate tables) =====

export const masterSkillLevel = pgTable("master_skill_level", {
  skillLevelId: bigint("skill_level_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const masterCookingMethod = pgTable("master_cooking_method", {
  cookingMethodId: bigint("cooking_method_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const masterCategory = pgTable("master_category", {
  categoryId: bigint("category_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const masterEquipment = pgTable("master_equipment", {
  equipmentId: bigint("equipment_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ADR-012: user tier from total likes across own recipes
export const masterTier = pgTable("master_tier", {
  tierId: bigint("tier_id", { mode: "number" })
    .primaryKey()
    .generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  minLikes: integer("min_likes").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== Users =====

export const users = pgTable(
  "users",
  {
    userId: bigint("user_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    profilePicturePath: varchar("profile_picture_path", { length: 500 }),
    role: text("role").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // added by 003_user_tier.sql; set by DB trigger on insert (ADR-012)
    tierId: bigint("tier_id", { mode: "number" }).references(
      () => masterTier.tierId,
      { onDelete: "restrict" },
    ),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('user','admin')`)],
);

// ===== Recipe (ADR-005 single table + status) =====

export const recipe = pgTable(
  "recipe",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    recipeName: varchar("recipe_name", { length: 255 }),
    description: text("description"), // nullable while draft, required at publish (app-enforced)
    skillLevelId: bigint("skill_level_id", { mode: "number" }).references(
      () => masterSkillLevel.skillLevelId,
      { onDelete: "restrict" },
    ),
    cookTimeMinutes: integer("cook_time_minutes"), // ADR-011: user-entered minutes
    cookingMethodId: bigint("cooking_method_id", { mode: "number" }).references(
      () => masterCookingMethod.cookingMethodId,
      { onDelete: "restrict" },
    ),
    categoryId: bigint("category_id", { mode: "number" }).references(
      () => masterCategory.categoryId,
      { onDelete: "restrict" },
    ),
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "recipe_status_check",
      sql`${t.status} in ('draft','published','private')`,
    ),
    index("idx_recipe_feed").on(t.status, t.publishedAt.desc()),
    index("idx_recipe_owner").on(t.userId),
  ],
);

// ===== Ingredient / Unit (ADR-001, ADR-007) =====

export const ingredient = pgTable(
  "ingredient",
  {
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 150 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // case-insensitive dedupe
    uniqueIndex("uq_ingredient_name").on(sql`lower(${t.name})`),
  ],
);

export const unit = pgTable(
  "unit",
  {
    unitId: bigint("unit_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_unit_name").on(sql`lower(${t.name})`)],
);

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    ingredientId: bigint("ingredient_id", { mode: "number" })
      .notNull()
      .references(() => ingredient.ingredientId, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    unitId: bigint("unit_id", { mode: "number" }).references(
      () => unit.unitId,
      { onDelete: "restrict" },
    ),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.ingredientId] }),
    index("idx_recipe_ingredient_reverse").on(t.ingredientId), // advanced search filter
  ],
);

// ===== Equipment junction (ADR-002) =====

export const recipeEquipment = pgTable(
  "recipe_equipment",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    equipmentId: bigint("equipment_id", { mode: "number" })
      .notNull()
      .references(() => masterEquipment.equipmentId, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.equipmentId] }),
    index("idx_recipe_equipment_reverse").on(t.equipmentId),
  ],
);

// ===== Cooking steps =====

export const cookingStep = pgTable(
  "cooking_step",
  {
    stepId: bigint("step_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    instruction: text("instruction").notNull(),
    imagePath: varchar("image_path", { length: 500 }), // Supabase object path (ADR-009)
  },
  (t) => [
    unique("cooking_step_recipe_id_step_number_key").on(
      t.recipeId,
      t.stepNumber,
    ),
  ],
);

// ===== Media (ADR-009) =====

export const recipeMedia = pgTable(
  "recipe_media",
  {
    mediaId: bigint("media_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull(),
    bucket: varchar("bucket", { length: 100 }).notNull(),
    objectPath: varchar("object_path", { length: 500 }).notNull(),
    isCover: boolean("is_cover").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "recipe_media_media_type_check",
      sql`${t.mediaType} in ('image','video')`,
    ),
    index("idx_recipe_media_recipe").on(t.recipeId),
  ],
);

// ===== Comment (ADR-006, ADR-008) =====

export const comment = pgTable(
  "comment",
  {
    commentId: bigint("comment_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    commentText: text("comment_text").notNull(),
    imagePath: varchar("image_path", { length: 500 }), // 1 attached image (ADR-009)
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }), // nullable — set on edit
  },
  (t) => [index("idx_comment_recipe").on(t.recipeId, t.createdAt.desc())],
);

// ===== Engagement (ADR-006, ADR-008: counts via COUNT, no denormalization) =====

export const recipeLike = pgTable(
  "recipe_like",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.userId] })],
);

export const recipeFavorite = pgTable(
  "recipe_favorite",
  {
    recipeId: bigint("recipe_id", { mode: "number" })
      .notNull()
      .references(() => recipe.recipeId, { onDelete: "cascade" }),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.userId] }),
    index("idx_favorite_user").on(t.userId, t.createdAt.desc()), // saved list
  ],
);

// ===== Recent search =====

export const recentSearch = pgTable(
  "recent_search",
  {
    searchId: bigint("search_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 255 }).notNull(),
    searchedAt: timestamp("searched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("recent_search_user_id_keyword_key").on(t.userId, t.keyword),
  ],
);
