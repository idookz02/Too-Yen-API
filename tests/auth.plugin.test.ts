import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { app } from "../src/index";
import {
  authPlugin,
  jwtPlugin,
  requireAdmin,
} from "../src/shared/plugins/auth.plugin";

/** Standalone app exercising the guards (no DB involved). */
const guarded = new Elysia()
  .use(app) // reuse the global onError mapping
  .use(authPlugin)
  .get("/protected", ({ currentUser }) => currentUser)
  .get("/admin-only", ({ currentUser }) => {
    requireAdmin(currentUser);
    return { ok: true };
  });

async function signToken(payload: { sub: string; role: string }) {
  let token = "";
  const signer = new Elysia()
    .use(jwtPlugin)
    .get("/sign", async ({ jwt }) => {
      token = await jwt.sign(payload);
      return token;
    });
  await signer.handle(new Request("http://localhost/sign"));
  return token;
}

describe("authPlugin", () => {
  it("401 UNAUTHENTICATED without a token", async () => {
    const res = await guarded.handle(new Request("http://localhost/protected"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("401 on a garbage token", async () => {
    const res = await guarded.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: "Bearer not-a-jwt" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("resolves currentUser from a valid token", async () => {
    const token = await signToken({ sub: "42", role: "user" });
    const res = await guarded.handle(
      new Request("http://localhost/protected", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId: 42, role: "user" });
  });

  it("403 FORBIDDEN for non-admin on admin routes", async () => {
    const token = await signToken({ sub: "42", role: "user" });
    const res = await guarded.handle(
      new Request("http://localhost/admin-only", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("lets admin through", async () => {
    const token = await signToken({ sub: "1", role: "admin" });
    const res = await guarded.handle(
      new Request("http://localhost/admin-only", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
  });
});
