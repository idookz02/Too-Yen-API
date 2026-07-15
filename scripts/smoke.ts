/**
 * Smoke test (Step 9) — drives EVERY endpoint per the specs against the real
 * database + storage, in-process via app.handle (no port). Prerequisites:
 * a full .env and `bun run db:seed` (masters + demo admin must exist).
 *
 * Run: bun run smoke
 * Creates one throwaway user per run (users have no delete endpoint — the row
 * remains); recipes/media/comments created here are cleaned up at the end.
 */
process.env.RATE_LIMIT_AUTH_MAX ??= "1000"; // don't trip the auth limiter

const sharp = (await import("sharp")).default;
const { app } = await import("../src/index");

const TS = Date.now();
const SMOKE_USER = {
  email: `smoke-${TS}@test.local`,
  username: `smoke_${TS}`,
  password: "Smoke1234!",
  display_name: "Smoke Tester",
};
const ADMIN = {
  username: process.env.SMOKE_ADMIN_USERNAME ?? "admin",
  password: process.env.SMOKE_ADMIN_PASSWORD ?? "Admin1234!",
};

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.error(`  ❌ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
};
const section = (name: string) => console.log(`\n=== ${name} ===`);

type Init = { method?: string; json?: unknown; form?: FormData; token?: string };
async function api(path: string, init: Init = {}) {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: string | FormData | undefined;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    body = init.form;
  }
  const res = await app.handle(
    new Request(`http://smoke/api/v1${path}`, { method: init.method ?? "GET", headers, body }),
  );
  let data: unknown = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  // deliberately loose — a smoke script asserts shapes at runtime, not compile time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, data: data as any };
}

const pngFile = async (name: string) =>
  new File(
    [new Uint8Array(await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 40, g: 120, b: 200 } } }).png().toBuffer())],
    name,
    { type: "image/png" },
  );

// ============================== flow ==============================

section("ops");
{
  const hz = await app.handle(new Request("http://smoke/healthz"));
  ok("GET /healthz -> 200", hz.status === 200);
  const sw = await app.handle(new Request("http://smoke/swagger"));
  ok("GET /swagger -> 200 (all modules visible)", sw.status === 200);
}

section("auth");
let token = "";
let adminToken = "";
{
  const form = new FormData();
  for (const [k, v] of Object.entries(SMOKE_USER)) form.append(k, v);
  const signup = await api("/auth/signup", { method: "POST", form });
  ok("signup -> 201 + token + Rookie tier", signup.status === 201 && !!signup.data.access_token && signup.data.user.tier?.name === "Rookie", signup.data);
  token = signup.data.access_token;

  const dupForm = new FormData();
  for (const [k, v] of Object.entries(SMOKE_USER)) dupForm.append(k, v);
  const dup = await api("/auth/signup", { method: "POST", form: dupForm });
  ok("duplicate signup -> 409 DUPLICATE_ACCOUNT", dup.status === 409 && dup.data.error.code === "DUPLICATE_ACCOUNT");

  const login = await api("/auth/login", { method: "POST", json: { username: SMOKE_USER.username, password: SMOKE_USER.password } });
  ok("login -> 200", login.status === 200 && !!login.data.access_token);

  const bad = await api("/auth/login", { method: "POST", json: { username: SMOKE_USER.username, password: "wrong-pass-1" } });
  ok("wrong password -> 401 INVALID_CREDENTIALS", bad.status === 401 && bad.data.error.code === "INVALID_CREDENTIALS");

  const check = await api("/auth/forgot-password/check", { method: "POST", json: { identifier: SMOKE_USER.email } });
  ok("forgot check (email) -> 200 reset_token", check.status === 200 && !!check.data.reset_token);

  const byUsername = await api("/auth/forgot-password/check", { method: "POST", json: { identifier: SMOKE_USER.username } });
  ok("forgot check (username only) -> 404 (2026-07-10 hardening)", byUsername.status === 404);

  const newPw = "Smoke5678!";
  const reset = await api("/auth/forgot-password/reset", { method: "POST", json: { reset_token: check.data.reset_token, new_password: newPw, confirm_password: newPw } });
  ok("reset -> 204", reset.status === 204);

  const relogin = await api("/auth/login", { method: "POST", json: { username: SMOKE_USER.username, password: newPw } });
  ok("login with the new password -> 200", relogin.status === 200);
  token = relogin.data.access_token;

  const adminLogin = await api("/auth/login", { method: "POST", json: ADMIN });
  ok("admin login -> 200 (seeded)", adminLogin.status === 200, adminLogin.data);
  adminToken = adminLogin.data.access_token ?? "";
}

section("masters (public dropdowns)");
const masterIds: Record<string, number> = {};
{
  for (const type of ["skill-levels", "cooking-methods", "categories", "equipment"]) {
    const res = await api(`/master/${type}`, { token });
    ok(`GET /master/${type} -> 200 with data (seeded)`, res.status === 200 && res.data.data.length > 0);
    masterIds[type] = res.data.data[0]?.id;
  }
}

section("recipes");
let recipeId = 0;
let ingredientId = 0;
let equipmentId = 0;
{
  const recipeData = {
    recipe_name: `Smoke Curry ${TS}`,
    description: "Smoke-test recipe",
    cook_time_minutes: 15,
    skill_level_id: masterIds["skill-levels"],
    cooking_method_id: masterIds["cooking-methods"],
    category_id: masterIds["categories"],
    // equipment by id (dropdown) + a new one by name (find-or-created into master)
    equipment: [{ equipment_id: masterIds["equipment"] }, { name: `Smoke Gadget ${TS}` }],
    ingredients: [{ name: `Smoke Ingredient ${TS}`, amount: 2, unit_name: "cup" }],
    steps: [{ step_number: 1, instruction: "Stir everything." }],
  };
  const createForm = new FormData();
  createForm.append("data", JSON.stringify(recipeData));
  const create = await api("/recipes", { method: "POST", token, form: createForm });
  ok("create draft -> 201", create.status === 201 && create.data.status === "draft", create.data);
  ok("equipment id + new name both attached (2 rows)", create.data.equipment?.length === 2, create.data.equipment);
  recipeId = create.data.recipe_id;
  ingredientId = create.data.ingredients?.[0]?.ingredient_id ?? 0;
  equipmentId = create.data.equipment?.find((e: { name: string }) => e.name.includes("Gadget"))?.id ?? 0;

  const early = await api(`/recipes/${recipeId}/publish`, { method: "POST", token });
  ok("publish without cover -> 400 INCOMPLETE_RECIPE [cover_image]", early.status === 400 && early.data.error.code === "INCOMPLETE_RECIPE" && early.data.error.details?.includes("cover_image"));

  const mediaForm = new FormData();
  mediaForm.append("file", await pngFile("cover.png"));
  mediaForm.append("type", "image");
  mediaForm.append("is_cover", "true");
  const media = await api(`/recipes/${recipeId}/media`, { method: "POST", token, form: mediaForm });
  ok("upload cover -> 201 (compressed to .webp)", media.status === 201 && media.data.url?.includes(".webp"), media.data);

  const publish = await api(`/recipes/${recipeId}/publish`, { method: "POST", token });
  ok("publish -> 200 published", publish.status === 200 && publish.data.status === "published");

  const feed = await api("/recipes?sort=newest", { token });
  ok("feed contains the new recipe", feed.status === 200 && feed.data.data.some((c: { recipe_id: number }) => c.recipe_id === recipeId));

  const detail = await api(`/recipes/${recipeId}`, { token });
  ok("detail -> 200 with ingredients/steps/media", detail.status === 200 && detail.data.ingredients.length === 1 && detail.data.media.length === 1);
  const unitId = detail.data.ingredients?.[0]?.unit?.id ?? 0;

  // ingredient by id (dropdown pick) — reuses the master row, no new ingredient created
  const byIdForm = new FormData();
  byIdForm.append(
    "data",
    JSON.stringify({
      // only send unit_id when we actually captured one (0 would fail minimum:1)
      ingredients: [{ ingredient_id: ingredientId, amount: 3, ...(unitId > 0 && { unit_id: unitId }) }],
    }),
  );
  const byId = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: byIdForm });
  ok(
    "ingredient by ingredient_id (dropdown) -> 200, same master id reused",
    byId.status === 200 && byId.data.ingredients?.[0]?.ingredient_id === ingredientId,
    byId.data,
  );

  // a not-found ingredient_id is rejected before any write
  const badIdForm = new FormData();
  badIdForm.append("data", JSON.stringify({ ingredients: [{ ingredient_id: 999999999 }] }));
  const badId = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: badIdForm });
  ok(
    "not-found ingredient_id -> 400 VALIDATION_ERROR",
    badId.status === 400 && badId.data.error?.code === "VALIDATION_ERROR",
    badId.data,
  );

  // equipment by id (dropdown) reuses the master row; a not-found id is rejected
  const eqByIdForm = new FormData();
  eqByIdForm.append("data", JSON.stringify({ equipment: [{ equipment_id: equipmentId }] }));
  const eqById = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: eqByIdForm });
  ok(
    "equipment by equipment_id (dropdown) -> 200, same master id reused",
    eqById.status === 200 && eqById.data.equipment?.[0]?.id === equipmentId,
    eqById.data,
  );

  const badEqForm = new FormData();
  badEqForm.append("data", JSON.stringify({ equipment: [{ equipment_id: 999999999 }] }));
  const badEq = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: badEqForm });
  ok(
    "not-found equipment_id -> 400 VALIDATION_ERROR",
    badEq.status === 400 && badEq.data.error?.code === "VALIDATION_ERROR",
    badEq.data,
  );

  const patchForm = new FormData();
  patchForm.append("data", JSON.stringify({ description: "Updated by smoke" }));
  const patch = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: patchForm });
  ok("patch (multipart data) -> 200", patch.status === 200 && patch.data.description === "Updated by smoke");

  const jsonAttempt = await api(`/recipes/${recipeId}`, { method: "PATCH", token, json: { description: "old way" } });
  ok("old JSON body -> 400 with a helpful message", jsonAttempt.status === 400 && String(jsonAttempt.data.error?.message ?? "").includes("multipart"));

  const stepForm = new FormData();
  stepForm.append("file", await pngFile("step.png"));
  const stepImg = await api(`/recipes/${recipeId}/steps/1/image`, { method: "PUT", token, form: stepForm });
  ok("step image -> 200", stepImg.status === 200 && !!stepImg.data.image_url);
}

section("recipes — single-shot create (multipart + publish)");
{
  const oneShotForm = new FormData();
  oneShotForm.append(
    "data",
    JSON.stringify({
      recipe_name: `Smoke OneShot ${TS}`,
      description: "Created + published in one request",
      cook_time_minutes: 5,
      skill_level_id: masterIds["skill-levels"],
      cooking_method_id: masterIds["cooking-methods"],
      category_id: masterIds["categories"],
      equipment: [{ equipment_id: masterIds["equipment"] }],
      ingredients: [{ name: `Smoke Ingredient ${TS}` }],
      steps: [{ step_number: 1, instruction: "Mix.", image_field: "step1" }],
    }),
  );
  oneShotForm.append("cover", await pngFile("oneshot-cover.png"));
  oneShotForm.append("step1", await pngFile("oneshot-step.png"));
  oneShotForm.append("publish", "true");
  const oneShot = await api("/recipes", { method: "POST", token, form: oneShotForm });
  ok(
    "create + cover + step image + publish in ONE request -> 201 published",
    oneShot.status === 201 && oneShot.data.status === "published" && oneShot.data.steps?.[0]?.image_url,
    oneShot.data,
  );
  if (oneShot.data?.recipe_id) {
    const cleanup = await api(`/recipes/${oneShot.data.recipe_id}`, { method: "DELETE", token });
    ok("one-shot recipe cleaned up -> 204", cleanup.status === 204);
  }

  // all-or-nothing: publish without a cover must not leave a recipe behind
  const before = await api("/users/me/drafts", { token });
  const failForm = new FormData();
  failForm.append("data", JSON.stringify({ recipe_name: `Smoke Fail ${TS}` }));
  failForm.append("publish", "true");
  const failed = await api("/recipes", { method: "POST", token, form: failForm });
  const after = await api("/users/me/drafts", { token });
  ok(
    "publish-incomplete one-shot -> 400 INCOMPLETE_RECIPE and NO recipe left behind",
    failed.status === 400 && failed.data.error.code === "INCOMPLETE_RECIPE" && after.data.pagination.total === before.data.pagination.total,
  );
}

section("search");
{
  const byName = await api(`/search/recipes?q=${encodeURIComponent(`Smoke Curry ${TS}`)}`, { token });
  ok("keyword search finds it (relevance default)", byName.status === 200 && byName.data.data.some((c: { recipe_id: number }) => c.recipe_id === recipeId));

  const byIngredient = await api(`/search/recipes?q=${encodeURIComponent(`Smoke Ingredient ${TS}`)}`, { token });
  ok("keyword matches the ingredient name (expanded q)", byIngredient.status === 200 && byIngredient.data.data.some((c: { recipe_id: number }) => c.recipe_id === recipeId));

  const match = await api(`/search/match?ingredient_ids=${ingredientId}`, { token });
  const matched = match.data.data?.find((c: { recipe_id: number }) => c.recipe_id === recipeId);
  ok("pantry match -> 100% on the single-ingredient recipe", match.status === 200 && matched?.ingredient_match?.pct === 100, matched);

  const recent = await api("/search/recent", { token });
  ok("recent searches recorded", recent.status === 200 && recent.data.keywords.length >= 1);

  const delRecent = await api(`/search/recent/${encodeURIComponent(`Smoke Curry ${TS}`)}`, { method: "DELETE", token });
  ok("delete recent -> 204", delRecent.status === 204);

  const auto = await api(`/ingredients?q=${encodeURIComponent("Smoke Ingredient")}`, { token });
  ok("ingredient autocomplete -> 200", auto.status === 200 && auto.data.data.length >= 1);
  const units = await api("/units?q=cu", { token });
  ok("unit autocomplete -> 200", units.status === 200);
}

section("engagement");
{
  const like1 = await api(`/recipes/${recipeId}/like`, { method: "PUT", token });
  ok("like -> 200 liked", like1.status === 200 && like1.data.liked === true && like1.data.like_count === 1);
  const like2 = await api(`/recipes/${recipeId}/like`, { method: "PUT", token });
  ok("double like idempotent (count stays 1)", like2.data.like_count === 1);

  const fav = await api(`/recipes/${recipeId}/favorite`, { method: "PUT", token });
  ok("favorite -> 200", fav.status === 200 && fav.data.favorited === true);

  const cForm = new FormData();
  cForm.append("comment_text", "Smoke comment");
  const created = await api(`/recipes/${recipeId}/comments`, { method: "POST", token, form: cForm });
  ok("comment -> 201", created.status === 201 && created.data.is_mine === true);

  const edited = await api(`/comments/${created.data.comment_id}`, { method: "PATCH", token, form: (() => { const f = new FormData(); f.append("comment_text", "Edited smoke comment"); return f; })() });
  ok("edit comment -> 200 with updated_at", edited.status === 200 && edited.data.updated_at !== null);

  const del = await api(`/comments/${created.data.comment_id}`, { method: "DELETE", token });
  ok("soft delete comment -> 204", del.status === 204);
  const list = await api(`/recipes/${recipeId}/comments`, { token });
  ok("deleted comment hidden from the list", list.status === 200 && !list.data.data.some((c: { comment_id: number }) => c.comment_id === created.data.comment_id));
}

section("profile");
{
  const me = await api("/users/me", { token });
  ok("GET /users/me -> 200", me.status === 200 && me.data.username === SMOKE_USER.username);

  const saved = await api("/users/me/saved-recipes", { token });
  ok("saved list contains the favorited recipe", saved.status === 200 && saved.data.data.some((c: { recipe_id: number }) => c.recipe_id === recipeId));

  const aForm = new FormData();
  aForm.append("file", await pngFile("avatar.png"));
  const avatar = await api("/users/me/avatar", { method: "PUT", token, form: aForm });
  ok("avatar upload -> 200 (webp)", avatar.status === 200 && avatar.data.profile_picture_url?.includes(".webp"));

  const vis = await api(`/recipes/${recipeId}/visibility`, { method: "PATCH", token, json: { status: "private" } });
  ok("visibility -> private", vis.status === 200 && vis.data.status === "private");
  const own = await api("/users/me/recipes?status=private", { token });
  ok("own private list shows it", own.status === 200 && own.data.data.some((c: { recipe_id: number }) => c.recipe_id === recipeId));
}

section("admin master");
{
  const asUser = await api("/admin/master/types", { token });
  ok("admin route as normal user -> 403", asUser.status === 403);

  if (adminToken) {
    const types = await api("/admin/master/types", { token: adminToken });
    ok("GET /admin/master/types -> 200 (7 types)", types.status === 200 && types.data.types.length === 7);

    const name = `Smoke Equipment ${TS}`;
    const created = await api("/admin/master/equipment", { method: "POST", token: adminToken, json: { name } });
    ok("create master entry -> 201", created.status === 201 && created.data.name === name);

    const dup = await api("/admin/master/equipment", { method: "POST", token: adminToken, json: { name: name.toLowerCase() } });
    ok("case-insensitive duplicate -> 409", dup.status === 409);

    const del = await api(`/admin/master/equipment/${created.data.id}`, { method: "DELETE", token: adminToken });
    ok("soft delete -> 204", del.status === 204);

    const revived = await api("/admin/master/equipment", { method: "POST", token: adminToken, json: { name } });
    ok("re-create reactivates the same row (ADR-003)", revived.status === 201 && revived.data.id === created.data.id);
    await api(`/admin/master/equipment/${created.data.id}`, { method: "DELETE", token: adminToken }); // leave it inactive

    // a soft-deleted ingredient referenced by id on recipe save is reactivated (ADR-003)
    const ingName = `Smoke Reactivate ${TS}`;
    const ing = await api("/admin/master/ingredients", { method: "POST", token: adminToken, json: { name: ingName } });
    ok("create ingredient master -> 201", ing.status === 201);
    const softDel = await api(`/admin/master/ingredients/${ing.data.id}`, { method: "DELETE", token: adminToken });
    ok("soft delete ingredient -> 204", softDel.status === 204);

    const reuseForm = new FormData();
    reuseForm.append("data", JSON.stringify({ ingredients: [{ ingredient_id: ing.data.id }] }));
    const reuse = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: reuseForm });
    ok("recipe save by soft-deleted ingredient_id -> 200", reuse.status === 200 && reuse.data.ingredients?.[0]?.ingredient_id === ing.data.id, reuse.data);

    const relist = await api("/admin/master/ingredients", { token: adminToken });
    const back = relist.data?.data?.find((r: { id: number; is_active?: boolean }) => r.id === ing.data.id);
    ok("the referenced ingredient is reactivated (is_active=true)", relist.status === 200 && back?.is_active === true, back);

    // same reactivation path for equipment — `created.data.id` was left inactive above
    const eqReuseForm = new FormData();
    eqReuseForm.append("data", JSON.stringify({ equipment: [{ equipment_id: created.data.id }] }));
    const eqReuse = await api(`/recipes/${recipeId}`, { method: "PATCH", token, form: eqReuseForm });
    ok("recipe save by soft-deleted equipment_id -> 200", eqReuse.status === 200 && eqReuse.data.equipment?.[0]?.id === created.data.id, eqReuse.data);
    const eqRelist = await api("/admin/master/equipment", { token: adminToken });
    const eqBack = eqRelist.data?.data?.find((r: { id: number; is_active?: boolean }) => r.id === created.data.id);
    ok("the referenced equipment is reactivated (is_active=true)", eqRelist.status === 200 && eqBack?.is_active === true, eqBack);
  } else {
    ok("admin flow skipped — admin login failed (run db:seed first)", false);
  }
}

section("cleanup");
{
  const del = await api(`/recipes/${recipeId}`, { method: "DELETE", token });
  ok("delete recipe -> 204 (row cascade + storage files)", del.status === 204);
  const gone = await api(`/recipes/${recipeId}`, { token });
  ok("detail after delete -> 404", gone.status === 404);
}

section("self-cleanup (direct DB — users have no delete endpoint)");
{
  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { storageService, BUCKETS } = await import("../src/shared/services/storage.service");
  const { eq } = await import("drizzle-orm");

  const [me] = await db
    .select({ userId: users.userId, avatarPath: users.profilePicturePath })
    .from(users)
    .where(eq(users.username, SMOKE_USER.username))
    .limit(1);
  if (me) {
    if (me.avatarPath) await storageService.remove(BUCKETS.avatars, [me.avatarPath]);
    await db.delete(users).where(eq(users.userId, me.userId));
    ok(`smoke user ${SMOKE_USER.username} removed (row + avatar file)`, true);
  } else {
    ok("smoke user already gone", true);
  }
}

console.log(`\n${"=".repeat(40)}\nSmoke result: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

export {}; // top-level await requires module context under tsc

