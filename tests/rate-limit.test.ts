import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "../src/shared/utils/errors";
import { rateLimit } from "../src/shared/plugins/rate-limit.plugin";

// NOTE: do not `.use(app)` here — re-mounting the main app once per test trips
// Elysia's native static-response reuse on Bun 1.3+ ("ReadableStream is
// locked"). A minimal local mapper reproduces the 429 envelope instead.
const makeApp = () =>
  new Elysia()
    .onError(({ error, set }) => {
      if (error instanceof AppError) {
        set.status = error.statusCode;
        return { error: { code: error.code ?? "ERROR", message: error.message } };
      }
    })
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
