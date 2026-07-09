import { describe, expect, it } from "bun:test";
import { app } from "../src/index";

describe("GET /healthz", () => {
  it("returns { ok: true }", async () => {
    const res = await app.handle(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves swagger docs", async () => {
    const res = await app.handle(new Request("http://localhost/swagger"));
    expect(res.status).toBe(200);
  });
});
