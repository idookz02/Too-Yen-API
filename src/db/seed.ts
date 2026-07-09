/**
 * Seed script — populates reference data (ADR-010 amendment: seeding via code).
 * Run: bun run db:seed
 *
 * Idempotent: master tables dedupe on their unique `name`, so re-running is safe.
 * ⚠️ This inserts data — run against local/branch DBs freely; be deliberate
 * about running it against production. Starter skeleton — extend per module.
 */
import { db } from "./index";
import {
  masterCategory,
  masterCookingMethod,
  masterSkillLevel,
} from "./schema";

const log = (msg: string) => console.log(`[seed] ${msg}`);

async function seedSkillLevels() {
  log("seeding master_skill_level...");
  await db
    .insert(masterSkillLevel)
    .values([{ name: "Beginner" }, { name: "Intermediate" }, { name: "Expert" }])
    .onConflictDoNothing({ target: masterSkillLevel.name });
}

async function seedCookingMethods() {
  log("seeding master_cooking_method...");
  await db
    .insert(masterCookingMethod)
    .values([{ name: "Boil" }, { name: "Fry" }, { name: "Grill" }, { name: "Steam" }])
    .onConflictDoNothing({ target: masterCookingMethod.name });
}

async function seedCategories() {
  log("seeding master_category...");
  await db
    .insert(masterCategory)
    .values([{ name: "Main Dish" }, { name: "Dessert" }, { name: "Beverage" }])
    .onConflictDoNothing({ target: masterCategory.name });
}

async function main() {
  log("starting seed...");
  await seedSkillLevels();
  await seedCookingMethods();
  await seedCategories();
  log("done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
