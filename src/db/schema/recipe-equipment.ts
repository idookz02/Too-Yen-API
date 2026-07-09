import { bigint, index, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { recipe } from "./recipe";
import { masterEquipment } from "./master-equipment";

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
