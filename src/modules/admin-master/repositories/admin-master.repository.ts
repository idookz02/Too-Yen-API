import { and, asc, eq, ne, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Executor } from "../../../db";
import {
  masterCategory,
  masterCookingMethod,
  masterEquipment,
  ingredient,
  masterSkillLevel,
  masterTier,
  unit,
} from "../../../db/schema";
import type { MasterTypeParam } from "../../masters/dto/masters.dto";

export type MasterRow = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  minLikes: number | null;
  inUseCount: number;
};

/**
 * Generic handler over a type→table map (implementation-plan Phase 7).
 * All five master tables share the `name`/`isActive`/`createdAt` property
 * names, so inserts/updates can use one shape; only the id column differs.
 * in_use_count = recipes (or users, for tiers) referencing the entry (AC 7).
 */
type TypeConfig = {
  table:
    | typeof masterSkillLevel
    | typeof masterCookingMethod
    | typeof masterCategory
    | typeof masterEquipment
    | typeof ingredient
    | typeof unit
    | typeof masterTier;
  id: AnyPgColumn;
  minLikes: AnyPgColumn | null;
  inUseCount: SQL<number>;
};

const count = (fragment: SQL) => sql<number>`(${fragment})`.mapWith(Number);

const CONFIG: Record<MasterTypeParam, TypeConfig> = {
  "skill-levels": {
    table: masterSkillLevel,
    id: masterSkillLevel.skillLevelId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe r where r.skill_level_id = ${masterSkillLevel.skillLevelId}`,
    ),
  },
  "cooking-methods": {
    table: masterCookingMethod,
    id: masterCookingMethod.cookingMethodId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe_cooking_method rcm where rcm.cooking_method_id = ${masterCookingMethod.cookingMethodId}`,
    ),
  },
  categories: {
    table: masterCategory,
    id: masterCategory.categoryId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe r where r.category_id = ${masterCategory.categoryId}`,
    ),
  },
  equipment: {
    table: masterEquipment,
    id: masterEquipment.equipmentId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe_equipment re where re.equipment_id = ${masterEquipment.equipmentId}`,
    ),
  },
  ingredients: {
    table: ingredient,
    id: ingredient.ingredientId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe_ingredient ri where ri.ingredient_id = ${ingredient.ingredientId}`,
    ),
  },
  units: {
    table: unit,
    id: unit.unitId,
    minLikes: null,
    inUseCount: count(
      sql`select count(*) from recipe_ingredient ri where ri.unit_id = ${unit.unitId}`,
    ),
  },
  tiers: {
    table: masterTier,
    id: masterTier.tierId,
    minLikes: masterTier.minLikes,
    inUseCount: count(sql`select count(*) from users u where u.tier_id = ${masterTier.tierId}`),
  },
};

const selection = (cfg: TypeConfig) => ({
  id: cfg.id,
  name: cfg.table.name,
  isActive: cfg.table.isActive,
  createdAt: cfg.table.createdAt,
  minLikes: cfg.minLikes ?? sql<number | null>`null`,
  inUseCount: cfg.inUseCount,
});

export class AdminMasterRepository {
  /** Ordered by name A→Z; tiers by min_likes (AC 12). */
  async list(
    type: MasterTypeParam,
    includeInactive: boolean,
    executor: Executor = db,
  ): Promise<MasterRow[]> {
    const cfg = CONFIG[type];
    const rows = await executor
      .select(selection(cfg))
      .from(cfg.table as never)
      .where(includeInactive ? undefined : eq(cfg.table.isActive, true))
      .orderBy(cfg.minLikes ? asc(cfg.minLikes) : asc(cfg.table.name));
    return rows as MasterRow[];
  }

  async findById(
    type: MasterTypeParam,
    id: number,
    executor: Executor = db,
  ): Promise<MasterRow | null> {
    const cfg = CONFIG[type];
    const [row] = await executor
      .select(selection(cfg))
      .from(cfg.table as never)
      .where(eq(cfg.id, id))
      .limit(1);
    return (row as MasterRow | undefined) ?? null;
  }

  /** Case-insensitive name lookup (decision 2026-07-10). */
  async findByName(
    type: MasterTypeParam,
    name: string,
    executor: Executor = db,
  ): Promise<MasterRow | null> {
    const cfg = CONFIG[type];
    const [row] = await executor
      .select(selection(cfg))
      .from(cfg.table as never)
      .where(sql`lower(${cfg.table.name}) = lower(${name})`)
      .limit(1);
    return (row as MasterRow | undefined) ?? null;
  }

  /** Tiers: duplicate min_likes is also a 409 (spec 06). */
  async findByMinLikes(
    minLikes: number,
    excludeId?: number,
    executor: Executor = db,
  ): Promise<MasterRow | null> {
    const cfg = CONFIG.tiers;
    const conditions = [eq(masterTier.minLikes, minLikes)];
    if (excludeId != null) conditions.push(ne(masterTier.tierId, excludeId));
    const [row] = await executor
      .select(selection(cfg))
      .from(masterTier)
      .where(and(...conditions))
      .limit(1);
    return (row as MasterRow) ?? null;
  }

  async insert(
    type: MasterTypeParam,
    input: { name: string; minLikes?: number },
    executor: Executor = db,
  ): Promise<number> {
    const cfg = CONFIG[type];
    const values: Record<string, unknown> = { name: input.name };
    if (cfg.minLikes && input.minLikes !== undefined) values.minLikes = input.minLikes;
    const [created] = await executor
      .insert(cfg.table)
      .values(values as never)
      .returning({ id: cfg.id });
    if (!created) throw new Error(`insert ${type} returned no row`);
    return created.id as number;
  }

  async update(
    type: MasterTypeParam,
    id: number,
    patch: { name?: string; minLikes?: number; isActive?: boolean },
    executor: Executor = db,
  ): Promise<void> {
    const cfg = CONFIG[type];
    const values: Record<string, unknown> = {};
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.isActive !== undefined) values.isActive = patch.isActive;
    if (cfg.minLikes && patch.minLikes !== undefined) values.minLikes = patch.minLikes;
    if (Object.keys(values).length === 0) return;
    await executor
      .update(cfg.table)
      .set(values as never)
      .where(eq(cfg.id, id));
  }

  /** ADR-012: re-derive every user's tier after tier changes. */
  async recalcAllUserTiers(executor: Executor = db): Promise<void> {
    await executor.execute(sql`select recalc_user_tier(user_id) from users`);
  }
}

export const adminMasterRepository = new AdminMasterRepository();
