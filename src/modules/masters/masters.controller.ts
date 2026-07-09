import { Elysia } from "elysia";
import { mastersService } from "./services/masters.service";
import { MasterListResponseDTO, MasterTypeParams } from "./dto/masters.dto";

/**
 * Module 6 (public read) — user-facing master-data dropdowns.
 * Serves the Create Recipe form and Advanced Search filters (doc/api/06-admin-master.md).
 * This module is the reference template for the controller → service → repository → dto layering.
 */
export const mastersController = new Elysia({ prefix: "/master" }).get(
  "/:type",
  ({ params }) => mastersService.listActive(params.type),
  {
    params: MasterTypeParams,
    response: { 200: MasterListResponseDTO },
    detail: {
      tags: ["Master"],
      summary: "List active master-data entries",
      description:
        "Returns is_active = true entries for the given type " +
        "(skill-levels | cooking-methods | categories | equipment | tiers), " +
        "ordered by name (tiers by min_likes). Used by dropdowns — no auth required.",
    },
  },
);
