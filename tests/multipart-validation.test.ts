/**
 * HTTP-validation-layer regression tests (lesson from the 2026-07-10 live
 * smoke run): Elysia auto-parses JSON-looking multipart form values into
 * objects BEFORE schema validation, so `data: t.String()` rejected every
 * request while all mock-based unit tests stayed green. These tests drive the
 * REAL DTO through Elysia's real parse+validate pipeline with real FormData.
 */
import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import sharp from "sharp";
import { app } from "../src/index";
import { jwtPlugin } from "../src/shared/plugins/auth.plugin";
import { MultipartRecipeBodyDTO } from "../src/modules/recipes/dto/recipes.dto";

/** t.File({ type: "image" }) sniffs magic bytes — the fixture must be a real PNG. */
const realPng = async (name: string) =>
  new File(
    [
      new Uint8Array(
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
        })
          .png()
          .toBuffer(),
      ),
    ],
    name,
    { type: "image/png" },
  );

/**
 * Validation probe: the real schema + real parsing, a stub handler (no DB).
 * Bare instance on purpose — re-mounting the main app trips Elysia's native
 * static-response reuse on Bun 1.3+ ("ReadableStream is locked"); envelope
 * behaviour of the real app is covered by the real-route tests below.
 */
const probe = new Elysia().post(
  "/probe",
  ({ body }) => ({ dataType: typeof body.data, keys: Object.keys(body) }),
  { body: MultipartRecipeBodyDTO },
);

const send = (form: FormData) =>
  probe.handle(new Request("http://localhost/probe", { method: "POST", body: form }));

describe("MultipartRecipeBodyDTO through Elysia's real parser", () => {
  it("accepts data as a JSON string (arrives auto-parsed as an object)", async () => {
    const form = new FormData();
    form.append("data", JSON.stringify({ recipe_name: "Tom Yum", cook_time_minutes: 30 }));
    const res = await send(form);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataType: string };
    // documents the Elysia behaviour that caused the bug:
    expect(body.dataType).toBe("object");
  });

  it("a malformed JSON string stays a string and still validates (service rejects it later)", async () => {
    const form = new FormData();
    form.append("data", "{definitely not json");
    const res = await send(form);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dataType: string }).dataType).toBe("string");
  });

  it("accepts the full field set: data + cover + step_image_{n} + publish", async () => {
    const form = new FormData();
    form.append("data", JSON.stringify({ steps: [{ step_number: 1, instruction: "x" }] }));
    form.append("cover", await realPng("c.png"));
    form.append("step_image_1", await realPng("s.png"));
    form.append("publish", "true");
    const res = await send(form);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: string[] };
    expect(body.keys.sort()).toEqual(["cover", "data", "publish", "step_image_1"]);
  });

  // fake-image → 400 is asserted against the REAL route below (needs the
  // app's INVALID_FILE_TYPE mapper, which the bare probe doesn't have)

  it("accepts an empty multipart body (empty draft, AC M1-5)", async () => {
    const form = new FormData();
    form.append("_", ""); // FormData needs at least one field to set the content type
    const res = await send(form);
    expect(res.status).toBe(200);
  });

  it("rejects an invalid data shape at the schema layer", async () => {
    const form = new FormData();
    form.append("data", JSON.stringify({ steps: "not-an-array" }));
    const res = await send(form);
    expect(res.status).toBe(422); // raw Elysia validation — the bare probe has no mapper
  });
});

describe("real app route (regression pins for the smoke failures)", () => {
  const signToken = async () => {
    let token = "";
    const signer = new Elysia()
      .use(jwtPlugin)
      .get("/sign", async ({ jwt }) => (token = await jwt.sign({ sub: "1", role: "user" })));
    await signer.handle(new Request("http://localhost/sign"));
    return token;
  };

  it("POST /api/v1/recipes with FormData gets PAST validation", async () => {
    const form = new FormData();
    form.append("data", JSON.stringify({ recipe_name: "Regression Pin" }));
    const res = await app.handle(
      new Request("http://localhost/api/v1/recipes", {
        method: "POST",
        headers: { authorization: `Bearer ${await signToken()}` },
        body: form,
      }),
    );
    const body = (await res.json()) as { error?: { code?: string } };
    // with the dummy test DATABASE_URL this fails at the DB layer (500) —
    // the point is it must NOT die earlier as VALIDATION_ERROR (the smoke bug)
    expect(body.error?.code).not.toBe("VALIDATION_ERROR");
    expect(res.status).not.toBe(400);
  });

  it("a FAKE image (wrong magic bytes) -> 400 VALIDATION_ERROR, not 500", async () => {
    const form = new FormData();
    form.append("cover", new File(["not really a png"], "c.png", { type: "image/png" }));
    const res = await app.handle(
      new Request("http://localhost/api/v1/recipes", {
        method: "POST",
        headers: { authorization: `Bearer ${await signToken()}` },
        body: form,
      }),
    );
    expect(res.status).toBe(400); // schema-level sniff fails BEFORE any DB access
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
