import { t } from "elysia";

/** The master-data resource types (doc/api/06-admin-master.md). */
export const MASTER_TYPES = [
  "skill-levels",
  "cooking-methods",
  "categories",
  "equipment",
  "ingredients",
  "units",
  "tiers",
] as const;

export const MasterTypeParams = t.Object({
  type: t.Union(
    MASTER_TYPES.map((v) => t.Literal(v)),
    { description: "Master-data type", examples: ["skill-levels"] },
  ),
});
export type MasterTypeParam = (typeof MASTER_TYPES)[number];

export const MasterItemDTO = t.Object(
  {
    id: t.Number({ description: "Primary key", examples: [1] }),
    name: t.String({ examples: ["Beginner"] }),
    is_active: t.Boolean({ examples: [true] }),
    created_at: t.String({ format: "date-time" }),
    // present only for tiers (ADR-012)
    min_likes: t.Optional(t.Number({ examples: [500] })),
  },
  { description: "One master-data entry" },
);

export const MasterListResponseDTO = t.Object(
  { data: t.Array(MasterItemDTO) },
  {
    description:
      "Active master-data entries for dropdowns, ordered by name (tiers by min_likes)",
  },
);
