import {
  adminMasterRepository,
  type AdminMasterRepository,
  type MasterRow,
} from "../repositories/admin-master.repository";
import { badRequest, conflict, notFound } from "../../../shared/utils/errors";
import type { MasterTypeParam } from "../../masters/dto/masters.dto";
import { MASTER_TYPES } from "../../masters/dto/masters.dto";
import type { CreateMasterInput, UpdateMasterInput } from "../dto/admin-master.dto";

export type AdminMasterServiceDeps = { repo?: AdminMasterRepository };

export class AdminMasterService {
  private readonly repo: AdminMasterRepository;

  constructor(deps: AdminMasterServiceDeps = {}) {
    this.repo = deps.repo ?? adminMasterRepository;
  }

  // GET /admin/master/types
  types() {
    return { types: [...MASTER_TYPES] };
  }

  // GET /admin/master/{type}?include_inactive=
  async list(type: MasterTypeParam, includeInactive?: boolean | "true" | "false") {
    const include = includeInactive === true || includeInactive === "true";
    const rows = await this.repo.list(type, include);
    return { data: rows.map((r) => this.mapItem(type, r)) };
  }

  // POST /admin/master/{type} — 201; inactive name match reactivates (ADR-003)
  async create(type: MasterTypeParam, input: CreateMasterInput) {
    if (type === "tiers" && input.min_likes === undefined) {
      throw badRequest("min_likes is required for tiers", "VALIDATION_ERROR");
    }

    const existing = await this.repo.findByName(type, input.name);
    if (existing?.isActive) {
      throw conflict(`"${input.name}" already exists`, "DUPLICATE_ENTRY");
    }

    if (type === "tiers" && input.min_likes !== undefined) {
      const dup = await this.repo.findByMinLikes(input.min_likes, existing?.id);
      if (dup) {
        throw conflict(`min_likes ${input.min_likes} already exists`, "DUPLICATE_ENTRY");
      }
    }

    let id: number;
    if (existing) {
      // reactivate instead of creating a new row (ADR-003)
      await this.repo.update(type, existing.id, {
        isActive: true,
        name: input.name,
        minLikes: input.min_likes,
      });
      id = existing.id;
    } else {
      id = await this.repo.insert(type, { name: input.name, minLikes: input.min_likes });
    }

    if (type === "tiers") await this.repo.recalcAllUserTiers(); // decision 2026-07-10
    const row = await this.repo.findById(type, id);
    if (!row) throw new Error(`master ${type}/${id} vanished after write`);
    return this.mapItem(type, row);
  }

  // PATCH /admin/master/{type}/{id}
  async update(type: MasterTypeParam, id: number, input: UpdateMasterInput) {
    const current = await this.repo.findById(type, id);
    if (!current) throw notFound("Entry not found", "ENTRY_NOT_FOUND");

    if (input.name !== undefined) {
      const dup = await this.repo.findByName(type, input.name);
      if (dup && dup.id !== id) {
        throw conflict(`"${input.name}" already exists`, "DUPLICATE_ENTRY");
      }
    }
    if (type === "tiers" && input.min_likes !== undefined) {
      const dup = await this.repo.findByMinLikes(input.min_likes, id);
      if (dup) {
        throw conflict(`min_likes ${input.min_likes} already exists`, "DUPLICATE_ENTRY");
      }
    }

    await this.repo.update(type, id, { name: input.name, minLikes: input.min_likes });
    if (type === "tiers") await this.repo.recalcAllUserTiers(); // ADR-012
    const row = await this.repo.findById(type, id);
    if (!row) throw new Error(`master ${type}/${id} vanished after update`);
    return this.mapItem(type, row);
  }

  // DELETE /admin/master/{type}/{id} — soft delete (ADR-003) → 204
  async softDelete(type: MasterTypeParam, id: number) {
    const current = await this.repo.findById(type, id);
    if (!current) throw notFound("Entry not found", "ENTRY_NOT_FOUND");
    await this.repo.update(type, id, { isActive: false });
    if (type === "tiers") await this.repo.recalcAllUserTiers(); // decision 2026-07-10
  }

  private mapItem(type: MasterTypeParam, row: MasterRow) {
    return {
      id: row.id,
      name: row.name,
      is_active: row.isActive,
      in_use_count: row.inUseCount,
      used: row.inUseCount > 0,
      created_at: row.createdAt.toISOString(),
      ...(type === "tiers" && row.minLikes != null ? { min_likes: row.minLikes } : {}),
    };
  }
}

export const adminMasterService = new AdminMasterService();
