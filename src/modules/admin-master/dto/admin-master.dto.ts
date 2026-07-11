import { t } from "elysia";
import { MASTER_TYPES } from "../../masters/dto/masters.dto";

// ============================================================================
// Request DTOs (doc/api/06-admin-master.md)
// ============================================================================

export { MASTER_TYPES };
export const MasterTypeParams = t.Object({
  type: t.Union(
    MASTER_TYPES.map((v) => t.Literal(v)),
    { description: "Master-data type" },
  ),
});
export const MasterEntryParams = t.Object({
  type: t.Union(MASTER_TYPES.map((v) => t.Literal(v))),
  id: t.Numeric({ minimum: 1 }),
});

export const AdminListQueryDTO = t.Object({
  include_inactive: t.Optional(
    t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]),
  ),
});

export const CreateMasterDTO = t.Object({
  name: t.String({ minLength: 1, maxLength: 100, examples: ["Expert"] }),
  // tiers only (ADR-012) — required for tiers, rejected implicitly elsewhere
  min_likes: t.Optional(t.Integer({ minimum: 0, examples: [500] })),
});
export type CreateMasterInput = typeof CreateMasterDTO.static;

export const UpdateMasterDTO = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  min_likes: t.Optional(t.Integer({ minimum: 0 })),
});
export type UpdateMasterInput = typeof UpdateMasterDTO.static;

// ============================================================================
// Response DTOs
// ============================================================================

export const AdminMasterItemDTO = t.Object({
  id: t.Number(),
  name: t.String(),
  is_active: t.Boolean(),
  in_use_count: t.Number({
    description: "Recipes (or users, for tiers) referencing this entry — delete warning (AC 7)",
  }),
  created_at: t.String({ format: "date-time" }),
  min_likes: t.Optional(t.Number()),
});

export const AdminMasterListDTO = t.Object({ data: t.Array(AdminMasterItemDTO) });

export const MasterTypesResponseDTO = t.Object({
  types: t.Array(t.String(), { examples: [[...MASTER_TYPES]] }),
});
