import { mastersRepository } from "../repositories/masters.repository";
import type { MasterTypeParam } from "../dto/masters.dto";

export class MastersService {
  /** GET /master/{type} — active dropdown entries (doc/api/06-admin-master.md). */
  async listActive(type: MasterTypeParam) {
    const rows = await mastersRepository.listActive(type);
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        is_active: r.isActive,
        created_at: r.createdAt.toISOString(),
        ...(r.minLikes !== undefined ? { min_likes: r.minLikes } : {}),
      })),
    };
  }
}

export const mastersService = new MastersService();
