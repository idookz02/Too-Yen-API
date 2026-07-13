import { asc, eq } from "drizzle-orm";
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
import type { MasterTypeParam } from "../dto/masters.dto";

/** Normalised row shape shared by every master table. */
export type MasterRow = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  minLikes?: number;
};

export class MastersRepository {
  /** Active entries only, ordered by name (tiers by min_likes). */
  async listActive(
    type: MasterTypeParam,
    executor: Executor = db,
  ): Promise<MasterRow[]> {
    switch (type) {
      case "skill-levels": {
        const rows = await executor
          .select()
          .from(masterSkillLevel)
          .where(eq(masterSkillLevel.isActive, true))
          .orderBy(asc(masterSkillLevel.name));
        return rows.map((r) => ({
          id: r.skillLevelId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "cooking-methods": {
        const rows = await executor
          .select()
          .from(masterCookingMethod)
          .where(eq(masterCookingMethod.isActive, true))
          .orderBy(asc(masterCookingMethod.name));
        return rows.map((r) => ({
          id: r.cookingMethodId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "categories": {
        const rows = await executor
          .select()
          .from(masterCategory)
          .where(eq(masterCategory.isActive, true))
          .orderBy(asc(masterCategory.name));
        return rows.map((r) => ({
          id: r.categoryId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "equipment": {
        const rows = await executor
          .select()
          .from(masterEquipment)
          .where(eq(masterEquipment.isActive, true))
          .orderBy(asc(masterEquipment.name));
        return rows.map((r) => ({
          id: r.equipmentId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "ingredients": {
        const rows = await executor
          .select()
          .from(ingredient)
          .where(eq(ingredient.isActive, true))
          .orderBy(asc(ingredient.name));
        return rows.map((r) => ({
          id: r.ingredientId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "units": {
        const rows = await executor
          .select()
          .from(unit)
          .where(eq(unit.isActive, true))
          .orderBy(asc(unit.name));
        return rows.map((r) => ({
          id: r.unitId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
        }));
      }
      case "tiers": {
        const rows = await executor
          .select()
          .from(masterTier)
          .where(eq(masterTier.isActive, true))
          .orderBy(asc(masterTier.minLikes));
        return rows.map((r) => ({
          id: r.tierId,
          name: r.name,
          isActive: r.isActive,
          createdAt: r.createdAt,
          minLikes: r.minLikes,
        }));
      }
    }
  }
}

export const mastersRepository = new MastersRepository();
