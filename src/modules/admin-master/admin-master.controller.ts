import { Elysia, t } from "elysia";
import { authPlugin, requireAdmin } from "../../shared/plugins/auth.plugin";
import { adminMasterService } from "./services/admin-master.service";
import {
  AdminListQueryDTO,
  AdminMasterItemDTO,
  AdminMasterListDTO,
  CreateMasterDTO,
  MasterEntryParams,
  MasterTypeParams,
  MasterTypesResponseDTO,
  UpdateMasterDTO,
  UpdateStatusDTO,
} from "./dto/admin-master.dto";

/** Module 6 — Admin Master Data (doc/api/06-admin-master.md). Admin only (403 otherwise). */
export const adminMasterController = new Elysia({ prefix: "/admin/master" })
  .use(authPlugin)
  .onBeforeHandle(({ currentUser }) => {
    requireAdmin(currentUser); // every route in this module is admin-only (AC 1)
  })

  // GET /admin/master/types — tab list
  .get("/types", () => adminMasterService.types(), {
    response: { 200: MasterTypesResponseDTO },
    detail: { tags: ["Admin"], summary: "Master-data types" },
  })

  // GET /admin/master/{type}
  .get(
    "/:type",
    ({ params, query }) => adminMasterService.list(params.type, query.include_inactive),
    {
      params: MasterTypeParams,
      query: AdminListQueryDTO,
      response: { 200: AdminMasterListDTO },
      detail: {
        tags: ["Admin"],
        summary: "List master data",
        description:
          "Ordered by name A→Z (tiers by min_likes). in_use_count feeds the delete warning (AC 7).",
      },
    },
  )

  // POST /admin/master/{type}
  .post(
    "/:type",
    async ({ params, body, set }) => {
      set.status = 201;
      return adminMasterService.create(params.type, body);
    },
    {
      params: MasterTypeParams,
      body: CreateMasterDTO,
      response: { 201: AdminMasterItemDTO },
      detail: {
        tags: ["Admin"],
        summary: "Add entry",
        description:
          "A name matching an inactive entry reactivates it (ADR-003). Duplicates (name, or " +
          "min_likes for tiers, case-insensitive) → 409 DUPLICATE_ENTRY. Tiers require min_likes.",
      },
    },
  )

  // PATCH /admin/master/{type}/{id}
  .patch(
    "/:type/:id",
    ({ params, body }) => adminMasterService.update(params.type, params.id, body),
    {
      params: MasterEntryParams,
      body: UpdateMasterDTO,
      response: { 200: AdminMasterItemDTO },
      detail: {
        tags: ["Admin"],
        summary: "Edit entry",
        description:
          "Tier changes re-run recalc_user_tier for all users (ADR-012).",
      },
    },
  )

  // PATCH /admin/master/{type}/{id}/status — toggle is_active
  .patch(
    "/:type/:id/status",
    ({ params, body }) => adminMasterService.setStatus(params.type, params.id, body.is_active),
    {
      params: MasterEntryParams,
      body: UpdateStatusDTO,
      response: { 200: AdminMasterItemDTO },
      detail: {
        tags: ["Admin"],
        summary: "Toggle entry status",
        description:
          "Sets is_active (true = reactivate, false = soft delete). Idempotent. " +
          "Tier changes re-run recalc_user_tier (ADR-012).",
      },
    },
  )

  // DELETE /admin/master/{type}/{id} — soft delete
  .delete(
    "/:type/:id",
    async ({ params, set }) => {
      await adminMasterService.softDelete(params.type, params.id);
      set.status = 204;
    },
    {
      params: MasterEntryParams,
      response: { 204: t.Void() },
      detail: {
        tags: ["Admin"],
        summary: "Delete entry (soft)",
        description: "Sets is_active = false; existing recipes keep their references (AC 10).",
      },
    },
  );
