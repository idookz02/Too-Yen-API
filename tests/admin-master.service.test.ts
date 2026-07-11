/**
 * AdminMasterService unit tests with an in-memory mock repository — duplicate
 * handling (case-insensitive), reactivation (ADR-003), tier rules + recalc
 * (ADR-012), soft delete.
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { AdminMasterService } from "../src/modules/admin-master/services/admin-master.service";
import { AppError } from "../src/shared/utils/errors";
import type {
  AdminMasterRepository,
  MasterRow,
} from "../src/modules/admin-master/repositories/admin-master.repository";
import type { MasterTypeParam } from "../src/modules/masters/dto/masters.dto";

type State = {
  rows: Map<MasterTypeParam, MasterRow[]>;
  recalcCount: number;
  nextId: number;
};

let state: State;
let service: AdminMasterService;

const row = (over: Partial<MasterRow> = {}): MasterRow => ({
  id: 1,
  name: "Beginner",
  isActive: true,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  minLikes: null,
  inUseCount: 0,
  ...over,
});

beforeEach(() => {
  state = { rows: new Map(), recalcCount: 0, nextId: 100 };
  const rowsOf = (type: MasterTypeParam) => {
    if (!state.rows.has(type)) state.rows.set(type, []);
    return state.rows.get(type)!;
  };
  const repo = {
    list: async (type: MasterTypeParam, includeInactive: boolean) =>
      rowsOf(type).filter((r) => includeInactive || r.isActive),
    findById: async (type: MasterTypeParam, id: number) =>
      rowsOf(type).find((r) => r.id === id) ?? null,
    findByName: async (type: MasterTypeParam, name: string) =>
      rowsOf(type).find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null,
    findByMinLikes: async (minLikes: number, excludeId?: number) =>
      rowsOf("tiers").find((r) => r.minLikes === minLikes && r.id !== excludeId) ?? null,
    insert: async (type: MasterTypeParam, input: { name: string; minLikes?: number }) => {
      const created = row({
        id: state.nextId++,
        name: input.name,
        minLikes: input.minLikes ?? null,
      });
      rowsOf(type).push(created);
      return created.id;
    },
    update: async (
      type: MasterTypeParam,
      id: number,
      patch: { name?: string; minLikes?: number; isActive?: boolean },
    ) => {
      const r = rowsOf(type).find((x) => x.id === id);
      if (!r) return;
      if (patch.name !== undefined) r.name = patch.name;
      if (patch.minLikes !== undefined) r.minLikes = patch.minLikes;
      if (patch.isActive !== undefined) r.isActive = patch.isActive;
    },
    recalcAllUserTiers: async () => {
      state.recalcCount += 1;
    },
  };
  service = new AdminMasterService({ repo: repo as unknown as AdminMasterRepository });
});

const expectAppError = async (fn: () => Promise<unknown>, status: number, code: string) => {
  try {
    await fn();
    throw new Error(`expected AppError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(status);
    expect((e as AppError).code).toBe(code);
  }
};

describe("list", () => {
  it("filters inactive by default; include_inactive shows all", async () => {
    state.rows.set("categories", [
      row({ id: 1, name: "Thai" }),
      row({ id: 2, name: "Dessert", isActive: false }),
    ]);
    expect((await service.list("categories", undefined)).data).toHaveLength(1);
    expect((await service.list("categories", "true")).data).toHaveLength(2);
  });

  it("exposes min_likes only for tiers", async () => {
    state.rows.set("tiers", [row({ id: 1, name: "Bronze", minLikes: 0 })]);
    const res = await service.list("tiers", undefined);
    expect(res.data[0]).toMatchObject({ name: "Bronze", min_likes: 0 });
  });
});

describe("create", () => {
  it("creates a new entry", async () => {
    const res = await service.create("equipment", { name: "Pot" });
    expect(res).toMatchObject({ name: "Pot", is_active: true, in_use_count: 0 });
    expect(state.recalcCount).toBe(0); // non-tier -> no recalc
  });

  it("409 DUPLICATE_ENTRY on a case-insensitive name clash", async () => {
    state.rows.set("skill-levels", [row({ id: 1, name: "Beginner" })]);
    await expectAppError(
      () => service.create("skill-levels", { name: "beginner" }),
      409,
      "DUPLICATE_ENTRY",
    );
  });

  it("reactivates an inactive entry instead of creating a new row (ADR-003)", async () => {
    state.rows.set("categories", [row({ id: 7, name: "Dessert", isActive: false })]);
    const res = await service.create("categories", { name: "Dessert" });
    expect(res.id).toBe(7); // same row
    expect(res.is_active).toBe(true);
    expect(state.rows.get("categories")).toHaveLength(1); // no new row
  });

  it("tiers require min_likes", async () => {
    await expectAppError(
      () => service.create("tiers", { name: "Gold" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("tiers reject a duplicate min_likes and recalc on success", async () => {
    state.rows.set("tiers", [row({ id: 1, name: "Bronze", minLikes: 0 })]);
    await expectAppError(
      () => service.create("tiers", { name: "Silver", min_likes: 0 }),
      409,
      "DUPLICATE_ENTRY",
    );
    expect(state.recalcCount).toBe(0);
    await service.create("tiers", { name: "Silver", min_likes: 100 });
    expect(state.recalcCount).toBe(1); // decision 2026-07-10: recalc on every tier mutation
  });
});

describe("update", () => {
  it("404 ENTRY_NOT_FOUND for a missing id", async () => {
    await expectAppError(
      () => service.update("equipment", 99, { name: "Wok" }),
      404,
      "ENTRY_NOT_FOUND",
    );
  });

  it("409 when renaming onto another entry (case-insensitive), self-rename ok", async () => {
    state.rows.set("equipment", [row({ id: 1, name: "Pot" }), row({ id: 2, name: "Wok" })]);
    await expectAppError(
      () => service.update("equipment", 1, { name: "wok" }),
      409,
      "DUPLICATE_ENTRY",
    );
    const res = await service.update("equipment", 1, { name: "POT" }); // same row, new casing
    expect(res.name).toBe("POT");
  });

  it("tier min_likes update runs the recalc (ADR-012)", async () => {
    state.rows.set("tiers", [
      row({ id: 1, name: "Bronze", minLikes: 0 }),
      row({ id: 2, name: "Silver", minLikes: 100 }),
    ]);
    await expectAppError(
      () => service.update("tiers", 2, { min_likes: 0 }),
      409,
      "DUPLICATE_ENTRY",
    );
    await service.update("tiers", 2, { min_likes: 150 });
    expect(state.recalcCount).toBe(1);
  });
});

describe("softDelete", () => {
  it("sets is_active=false and keeps the row (ADR-003)", async () => {
    state.rows.set("categories", [row({ id: 1, name: "Thai" })]);
    await service.softDelete("categories", 1);
    expect(state.rows.get("categories")![0]!.isActive).toBe(false);
    expect(state.recalcCount).toBe(0);
  });

  it("tier delete triggers the recalc", async () => {
    state.rows.set("tiers", [row({ id: 1, name: "Gold", minLikes: 500 })]);
    await service.softDelete("tiers", 1);
    expect(state.recalcCount).toBe(1);
  });

  it("404 for a missing entry", async () => {
    await expectAppError(() => service.softDelete("equipment", 99), 404, "ENTRY_NOT_FOUND");
  });
});

describe("types", () => {
  it("returns the 5 tab types", () => {
    expect(service.types()).toEqual({
      types: ["skill-levels", "cooking-methods", "categories", "equipment", "tiers"],
    });
  });
});
