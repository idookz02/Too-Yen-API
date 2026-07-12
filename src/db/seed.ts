/**
 * Seed script (Step 9, plan: vibe-coding-plan.md) — tiers, starter master
 * data, 2 demo users, 3 published demo recipes (with real cover images
 * uploaded to Supabase Storage).
 *
 * Idempotent: masters/tiers dedupe on unique keys; users by email; demo
 * recipes are skipped when the demo user already owns recipes.
 * Run: bun run db:seed   (needs full .env — DB + Supabase storage)
 */
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "./index";
import {
  comment,
  cookingStep,
  ingredient,
  masterCategory,
  masterCookingMethod,
  masterEquipment,
  masterSkillLevel,
  masterTier,
  recipe,
  recipeEquipment,
  recipeIngredient,
  recipeLike,
  recipeMedia,
  unit,
  users,
} from "./schema";
import { hashPassword } from "../shared/utils/password";
import { BUCKETS, storageService } from "../shared/services/storage.service";

const log = (msg: string) => console.log(`[seed] ${msg}`);

// ===== reference data =====

async function seedTiers() {
  // min_likes is a floor, not a range — user sits in the highest tier where
  // min_likes <= total likes (ADR-012), so the upper bounds below (50/100/250/500)
  // are implied by the next tier's threshold, not stored anywhere.
  log("seeding master_tier (Rookie 0 / Commis Chef 51 / Sous Chef 101 / Master Chef 251)...");
  await db
    .insert(masterTier)
    .values([
      { name: "Rookie", minLikes: 0 }, // 0-50 likes
      { name: "Commis Chef", minLikes: 51 }, // 51-100 likes
      { name: "Sous Chef", minLikes: 101 }, // 101-250 likes
      { name: "Master Chef", minLikes: 251 }, // 251-500+ likes
    ])
    .onConflictDoNothing();
}

async function seedMasters() {
  log("seeding master data...");
  await db
    .insert(masterSkillLevel)
    .values([{ name: "Beginner" }, { name: "Intermediate" }, { name: "Expert" }])
    .onConflictDoNothing({ target: masterSkillLevel.name });
  await db
    .insert(masterCookingMethod)
    .values([{ name: "Boil" }, { name: "Fry" }, { name: "Grill" }, { name: "Steam" }, { name: "Bake" }])
    .onConflictDoNothing({ target: masterCookingMethod.name });
  await db
    .insert(masterCategory)
    .values([{ name: "Thai" }, { name: "Dessert" }, { name: "Beverage" }, { name: "Healthy" }])
    .onConflictDoNothing({ target: masterCategory.name });
  await db
    .insert(masterEquipment)
    .values([{ name: "Pot" }, { name: "Pan" }, { name: "Oven" }, { name: "Blender" }])
    .onConflictDoNothing({ target: masterEquipment.name });
}

// ===== demo users =====

const DEMO = {
  admin: { email: "admin@too-yen.local", username: "admin", password: "Admin1234!", displayName: "Too-Yen Admin", role: "admin" },
  user: { email: "demo@too-yen.local", username: "demo", password: "Demo1234!", displayName: "Demo Cook", role: "user" },
} as const;

async function seedUser(u: (typeof DEMO)[keyof typeof DEMO]): Promise<number> {
  const [existing] = await db
    .select({ userId: users.userId })
    .from(users)
    .where(eq(users.email, u.email))
    .limit(1);
  if (existing) return existing.userId;
  // tier_id is assigned by the DB trigger on insert (ADR-012)
  const [created] = await db
    .insert(users)
    .values({
      email: u.email,
      username: u.username,
      passwordHash: await hashPassword(u.password),
      displayName: u.displayName,
      role: u.role,
    })
    .returning({ userId: users.userId });
  return created!.userId;
}

// ===== demo recipes =====

type RecipeSeed = {
  name: string;
  description: string;
  cookTime: number;
  skill: string;
  method: string;
  category: string;
  equipment: string[];
  ingredients: { name: string; amount?: number; unit?: string }[];
  steps: string[];
  coverColor: { r: number; g: number; b: number };
};

const RECIPES: RecipeSeed[] = [
  {
    name: "Tom Yum Goong",
    description: "Hot and sour Thai shrimp soup with lemongrass and lime.",
    cookTime: 30,
    skill: "Intermediate",
    method: "Boil",
    category: "Thai",
    equipment: ["Pot"],
    ingredients: [
      { name: "Shrimp", amount: 300, unit: "gram" },
      { name: "Lemongrass", amount: 2, unit: "stalk" },
      { name: "Lime", amount: 1, unit: "piece" },
    ],
    steps: ["Boil water with lemongrass.", "Add shrimp and seasoning.", "Finish with lime juice."],
    coverColor: { r: 220, g: 90, b: 60 },
  },
  {
    name: "Mango Sticky Rice",
    description: "Classic Thai dessert — sweet coconut sticky rice with ripe mango.",
    cookTime: 45,
    skill: "Beginner",
    method: "Steam",
    category: "Dessert",
    equipment: ["Pot"],
    ingredients: [
      { name: "Sticky rice", amount: 200, unit: "gram" },
      { name: "Mango", amount: 1, unit: "piece" },
      { name: "Coconut milk", amount: 150, unit: "ml" },
    ],
    steps: ["Steam the sticky rice.", "Warm coconut milk with sugar.", "Serve rice with mango and sauce."],
    coverColor: { r: 250, g: 200, b: 70 },
  },
  {
    name: "Grilled Chicken Salad",
    description: "Light and healthy salad with grilled chicken breast.",
    cookTime: 20,
    skill: "Beginner",
    method: "Grill",
    category: "Healthy",
    equipment: ["Pan"],
    ingredients: [
      { name: "Chicken breast", amount: 200, unit: "gram" },
      { name: "Mixed greens", amount: 100, unit: "gram" },
    ],
    steps: ["Grill the chicken.", "Toss greens with dressing and top with sliced chicken."],
    coverColor: { r: 110, g: 180, b: 90 },
  },
];

const masterId = async (table: typeof masterSkillLevel | typeof masterCookingMethod | typeof masterCategory | typeof masterEquipment, idCol: string, name: string): Promise<number> => {
  const rows = await db.execute(
    sql`select * from ${table} where name = ${name} limit 1`,
  );
  const row = (rows as unknown as Record<string, unknown>[])[0];
  if (!row) throw new Error(`master row "${name}" not found — seed masters first`);
  return Number(row[idCol]);
};

async function findOrCreateIngredient(name: string): Promise<number> {
  const byName = () =>
    db
      .select({ id: ingredient.ingredientId })
      .from(ingredient)
      .where(sql`lower(${ingredient.name}) = lower(${name})`)
      .limit(1);
  const [existing] = await byName();
  if (existing) return existing.id;
  const [created] = await db
    .insert(ingredient)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: ingredient.ingredientId });
  if (created) return created.id;
  const [again] = await byName();
  if (!again) throw new Error(`findOrCreateIngredient failed for "${name}"`);
  return again.id;
}

async function findOrCreateUnit(name: string): Promise<number> {
  const byName = () =>
    db
      .select({ id: unit.unitId })
      .from(unit)
      .where(sql`lower(${unit.name}) = lower(${name})`)
      .limit(1);
  const [existing] = await byName();
  if (existing) return existing.id;
  const [created] = await db
    .insert(unit)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: unit.unitId });
  if (created) return created.id;
  const [again] = await byName();
  if (!again) throw new Error(`findOrCreateUnit failed for "${name}"`);
  return again.id;
}

async function seedRecipes(ownerId: number) {
  const [hasRecipes] = await db
    .select({ id: recipe.recipeId })
    .from(recipe)
    .where(eq(recipe.userId, ownerId))
    .limit(1);
  if (hasRecipes) {
    log("demo user already has recipes, skipping demo recipes...");
    return [];
  }

  const ids: number[] = [];
  for (const r of RECIPES) {
    log(`  creating "${r.name}"...`);
    const [created] = await db
      .insert(recipe)
      .values({
        userId: ownerId,
        recipeName: r.name,
        description: r.description,
        cookTimeMinutes: r.cookTime,
        skillLevelId: await masterId(masterSkillLevel, "skill_level_id", r.skill),
        cookingMethodId: await masterId(masterCookingMethod, "cooking_method_id", r.method),
        categoryId: await masterId(masterCategory, "category_id", r.category),
        status: "published",
        publishedAt: new Date(),
      })
      .returning({ recipeId: recipe.recipeId });
    const recipeId = created!.recipeId;
    ids.push(recipeId);

    for (const eq_ of r.equipment) {
      await db.insert(recipeEquipment).values({
        recipeId,
        equipmentId: await masterId(masterEquipment, "equipment_id", eq_),
      });
    }
    let sortOrder = 0;
    for (const ing of r.ingredients) {
      await db.insert(recipeIngredient).values({
        recipeId,
        ingredientId: await findOrCreateIngredient(ing.name),
        amount: ing.amount != null ? String(ing.amount) : null,
        unitId: ing.unit ? await findOrCreateUnit(ing.unit) : null,
        sortOrder: ++sortOrder,
      });
    }
    let stepNumber = 0;
    for (const instruction of r.steps) {
      await db.insert(cookingStep).values({ recipeId, stepNumber: ++stepNumber, instruction });
    }

    // real cover image so the feed/detail have a working URL (ADR-009)
    const cover = await sharp({
      create: { width: 800, height: 600, channels: 3, background: r.coverColor },
    })
      .webp({ quality: 80 })
      .toBuffer();
    const path = await storageService.upload(
      BUCKETS.recipeMedia,
      `${recipeId}/${crypto.randomUUID()}.webp`,
      new File([new Uint8Array(cover)], "cover.webp", { type: "image/webp" }),
    );
    await db.insert(recipeMedia).values({
      recipeId,
      mediaType: "image",
      bucket: BUCKETS.recipeMedia,
      objectPath: path,
      isCover: true,
      sortOrder: 0,
    });
  }
  return ids;
}

async function seedEngagement(adminId: number, recipeIds: number[]) {
  if (recipeIds.length === 0) return;
  log("seeding demo engagement (admin likes + comments the first recipe)...");
  await db
    .insert(recipeLike)
    .values({ recipeId: recipeIds[0]!, userId: adminId })
    .onConflictDoNothing();
  await db.insert(comment).values({
    recipeId: recipeIds[0]!,
    userId: adminId,
    commentText: "Looks delicious — trying this on the weekend!",
  });
}

async function main() {
  log("starting seed...");
  await seedTiers();
  await seedMasters();
  const adminId = await seedUser(DEMO.admin);
  const demoId = await seedUser(DEMO.user);
  const recipeIds = await seedRecipes(demoId);
  await seedEngagement(adminId, recipeIds);
  log("done.");
  log("---");
  log("Demo credentials (CHANGE for anything public!):");
  log(`  admin -> username: ${DEMO.admin.username}  password: ${DEMO.admin.password}`);
  log(`  user  -> username: ${DEMO.user.username}  password: ${DEMO.user.password}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
