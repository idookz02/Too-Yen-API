import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { app } from "../src/index";
import { rateLimit } from "../src/shared/plugins/rate-limit.plugin";

const makeApp = () =>
  new Elysia()
    .use(app) // reuse the global error mapper for the 429 envelope
    .use(rateLimit({ name: "test", windowMs: 60_000, max: 2 }))
    .get("/limited", () => ({ ok: true }));

const hit = (a: ReturnType<typeof makeApp>, ip: string) =>
  a.handle(new Request("http://localhost/limited", { headers: { "x-forwarded-for": ip } }));

describe("rateLimit", () => {
  it("allows up to max requests then returns 429 RATE_LIMITED", async () => {
    const a = makeApp();
    expect((await hit(a, "1.1.1.1")).status).toBe(200);
    expect((await hit(a, "1.1.1.1")).status).toBe(200);
    const third = await hit(a, "1.1.1.1");
    expect(third.status).toBe(429);
    const body = (await third.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });

  it("tracks IPs independently", async () => {
    const a = makeApp();
    expect((await hit(a, "2.2.2.2")).status).toBe(200);
    expect((await hit(a, "2.2.2.2")).status).toBe(200);
    expect((await hit(a, "3.3.3.3")).status).toBe(200); // fresh ip unaffected
    expect((await hit(a, "2.2.2.2")).status).toBe(429);
  });
});
