# ElysiaJS Project Structure & Best Practices

โครงสร้างโปรเจกต์นี้ออกแบบตามหลัก **Feature-Based Domain Design** (แยกตามฟีเจอร์) แบ่งเป็น 4 ชั้นชัดเจน (Controller → Service → Repository → DTO) เพื่อให้โค้ดยืดหยุ่น ขยายง่าย (Scalable) และเขียน Unit Test ได้อย่างมีประสิทธิภาพ

**Stack:** Bun + ElysiaJS + Drizzle ORM + PostgreSQL (Supabase)

## 📁 โครงสร้างโฟลเดอร์ (Project Tree)

```text
project-root/
├── src/
│   ├── modules/                        # ฟีเจอร์แยกตามโดเมน (1 โฟลเดอร์ = 1 โดเมน)
│   │   └── masters/                    # ตัวอย่างอ้างอิง (reference template)
│   │       ├── dto/
│   │       │   └── masters.dto.ts      # TypeBox schema สำหรับ validation + Swagger
│   │       ├── repositories/
│   │       │   └── masters.repository.ts  # Data access ชั้นเดียวที่แตะ Drizzle/DB
│   │       ├── services/
│   │       │   └── masters.service.ts  # Business Logic (ไม่ผูกกับ HTTP)
│   │       └── masters.controller.ts   # Route, Hook, เรียก Service
│   │
│   ├── db/
│   │   ├── schema/                     # Drizzle schema — 1 ไฟล์ต่อ 1 ตาราง
│   │   │   ├── index.ts                # barrel re-export ทุกตาราง (drizzle-kit อ่านโฟลเดอร์นี้)
│   │   │   ├── users.ts
│   │   │   ├── recipe.ts
│   │   │   └── ...                      # (17 ตาราง)
│   │   ├── schema.ts                   # @deprecated re-export ของ schema/ (คง import path เดิม)
│   │   ├── index.ts                    # db client (postgres.js + Drizzle) + type Db/Tx/Executor
│   │   ├── migrate.ts                  # ตัวรัน migration (bun run db:migrate)
│   │   └── seed.ts                     # seed reference data (bun run db:seed)
│   │
│   ├── shared/                         # โค้ดใช้ร่วมข้ามโมดูล
│   │   ├── utils/
│   │   │   └── errors.ts               # AppError + helpers (badRequest, notFound, ...)
│   │   ├── services/                   # domain service ที่หลายโมดูลใช้ร่วม
│   │   └── plugins/                    # per-controller plugin (เช่น auth) — ไม่ใช่ global
│   │
│   ├── config/
│   │   └── environment.ts              # จัดการ Environment Variables (lazy getters)
│   ├── plugins.ts                      # Global Plugins (CORS, Swagger)
│   └── index.ts                        # Entry Point + error mapping + wire controllers
│
├── drizzle/                            # ไฟล์ migration ที่ generate (ดู ⚠️ ADR-010)
├── drizzle.config.ts
├── package.json
└── bun.lockb
```

> **หมายเหตุ ADR-010:** Supabase DB คือ source of truth และมีข้อมูลจริงอยู่แล้ว — `src/db/schema/` เป็น *mirror* ของ DB นั้น ใช้ `drizzle-kit introspect`/`pull` เพื่อตรวจว่า mirror ตรง; **อย่า** `generate`/`migrate`/`push` schema เริ่มต้นทับ production (จะพยายามสร้างตารางที่มีอยู่แล้วซ้ำ) — สคริปต์ migration มีไว้สำหรับ fresh/branch DB เท่านั้น

---

## 💻 โดเมนตัวอย่าง: Master Data (`src/modules/masters/`)

โมดูลนี้เป็น **reference template** ของ 4-layer pattern — serve `GET /master/{type}` (dropdown สาธารณะ, active only)

### 1. Data Transfer Object (`dto/masters.dto.ts`)

ใช้ **TypeBox** (ติดมากับ Elysia) ทำ Request Validation + กำหนด Type ที่ปลอดภัย + สร้าง Swagger

```typescript
import { t } from "elysia";

export const MASTER_TYPES = [
  "skill-levels", "cooking-methods", "categories", "equipment", "tiers",
] as const;

export const MasterTypeParams = t.Object({
  type: t.Union(MASTER_TYPES.map((v) => t.Literal(v))),
});
export type MasterTypeParam = (typeof MASTER_TYPES)[number];

export const MasterListResponseDTO = t.Object({
  data: t.Array(
    t.Object({
      id: t.Number(),
      name: t.String(),
      is_active: t.Boolean(),
      created_at: t.String({ format: "date-time" }),
      min_likes: t.Optional(t.Number()),
    }),
  ),
});
```

### 2. Repository Layer (`repositories/masters.repository.ts`)

**ชั้นเดียวที่แตะ Drizzle/DB** — service คุยกับ repository ไม่คุยกับ `db` ตรง ๆ รับ `Executor` (`db` หรือ `tx`) เพื่อให้ทำงานในทรานแซกชันได้

```typescript
import { asc, eq } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import { masterSkillLevel } from "../../../db/schema";
import type { MasterTypeParam } from "../dto/masters.dto";

export class MastersRepository {
  async listActive(type: MasterTypeParam, executor: Executor = db) {
    // ... switch(type) -> select().from(table).where(eq(isActive, true))
    const rows = await executor
      .select()
      .from(masterSkillLevel)
      .where(eq(masterSkillLevel.isActive, true))
      .orderBy(asc(masterSkillLevel.name));
    return rows;
  }
}

export const mastersRepository = new MastersRepository();
```

### 3. Service Layer (`services/masters.service.ts`)

จัดการ Business Logic + map row → response shape ไม่รู้เรื่อง HTTP โยน `AppError` เมื่อ business rule ผิด (เช่น `conflict`, `notFound`)

```typescript
import { mastersRepository } from "../repositories/masters.repository";
import type { MasterTypeParam } from "../dto/masters.dto";

export class MastersService {
  async listActive(type: MasterTypeParam) {
    const rows = await mastersRepository.listActive(type);
    return { data: rows.map((r) => ({ /* ...camel -> snake_case */ })) };
  }
}

export const mastersService = new MastersService();
```

### 4. Controller Layer (`masters.controller.ts`)

รับ Request, กำหนด Route Path, ทำ Validation (`params`/`body`/`query` + `response`) แล้วส่งต่อ Service ทันที

```typescript
import { Elysia } from "elysia";
import { mastersService } from "./services/masters.service";
import { MasterListResponseDTO, MasterTypeParams } from "./dto/masters.dto";

export const mastersController = new Elysia({ prefix: "/master" }).get(
  "/:type",
  ({ params }) => mastersService.listActive(params.type),
  {
    params: MasterTypeParams,
    response: { 200: MasterListResponseDTO },
    detail: { tags: ["Master"], summary: "List active master-data entries" },
  },
);
```

---

## 🌐 ไฟล์หลัก (App Configuration)

### 5. Global Plugins (`src/plugins.ts`)

รวม Middleware ระดับแอป (CORS, Swagger) — plugin แบบ per-controller (เช่น auth) แยกไปอยู่ `src/shared/plugins/` เพื่อไม่ให้ route สาธารณะต้องแบกต้นทุน

```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

export const globalPlugins = new Elysia({ name: "global-plugins" })
  .use(cors())
  .use(swagger({ documentation: { info: { title: "Too-Yen API", version: "1.0.0" } } }));
```

### 6. Entry Point (`src/index.ts`)

รวม global plugins + **error mapping กลาง** (map `AppError` → HTTP ตาม envelope ใน `doc/api/README.md`) + wire ทุกโมดูลไว้ใต้ `/api/v1`

```typescript
import { Elysia } from "elysia";
import { globalPlugins } from "./plugins";
import { env } from "./config/environment";
import { AppError } from "./shared/utils/errors";
import { mastersController } from "./modules/masters/masters.controller";

export const app = new Elysia()
  .use(globalPlugins)
  // as: "global" เพื่อให้ครอบ child instance (/api/v1) ที่ mount ด้านล่างด้วย
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.statusCode;
      return { error: { code: error.code ?? "ERROR", message: error.message } };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: { code: "VALIDATION_ERROR", message: "Validation failed" } };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: { code: "NOT_FOUND", message: "Not found" } };
    }
    set.status = 500;
    return { error: { code: "INTERNAL_ERROR", message: "Internal server error" } };
  })
  .get("/healthz", () => ({ ok: true })) // ops endpoint — อยู่ที่ root นอก /api/v1
  // feature modules ทั้งหมด mount ใต้ /api/v1
  .use(new Elysia({ prefix: "/api/v1", name: "api-v1" }).use(mastersController));

// listen เฉพาะตอนรันตรง ไม่ใช่ตอนถูก import โดยเทสต์
if (import.meta.main) app.listen(env.PORT);
```

> - Error envelope เป็น **nested** `{ "error": { "code", "message" } }` ตาม `doc/api/README.md`
> - `/healthz` และ Swagger (`/swagger`) อยู่ที่ root; route ของ feature อยู่ใต้ `/api/v1` (เช่น `GET /api/v1/master/{type}`)
> - `app` ถูก export เพื่อให้ integration test เรียก `app.handle(new Request(...))` ได้โดยไม่ต้อง listen จริง

---

## 🎯 กฎเหล็ก Best Practice

1. **อย่าใส่ Business Logic ใน Controller:** Controller ทำแค่ validation แล้วส่งต่อ Service ทันที
2. **แยก Data Access ไว้ใน Repository:** มีแต่ repository ที่ import `db`/`schema` — service เรียก repository เท่านั้น (สลับ DB / mock ใน test ได้ง่าย)
3. **โยน `AppError` จาก Service:** ใช้ helper (`badRequest`/`unauthorized`/`notFound`/`conflict`) แล้วให้ error handler กลางใน `index.ts` map เป็น HTTP status — ไม่ set status เองใน service
4. **ใช้ Plugin แบบ Modular:** ทุกฟีเจอร์ประกาศเป็น `new Elysia()` ใหม่ เพื่อ `.use()` ต่อกันเป็นทอด ๆ
5. **กำหนด Schema เสมอ:** ใช้ `t.Object` ใน `body`/`query`/`params` **และ** `response` เพื่อตัดปัญหา Type Unsafe และได้ Swagger อัตโนมัติ
6. **1 ไฟล์ต่อ 1 ตาราง ใน `db/schema/`:** เพิ่มตารางใหม่ = สร้างไฟล์ใหม่ + export ผ่าน `db/schema/index.ts` (barrel)

---

## ➕ วิธีเพิ่มโมดูลใหม่ (เช่น `recipes`)

1. สร้าง `src/modules/recipes/` พร้อม 4 ไฟล์: `dto/recipes.dto.ts`, `repositories/recipes.repository.ts`, `services/recipes.service.ts`, `recipes.controller.ts`
2. Repository import ตารางที่ต้องใช้จาก `../../../db/schema`
3. `.use(recipesController)` เข้าไปใน v1 group ใน `src/index.ts` (route จะได้ prefix `/api/v1`) และเพิ่ม tag ใน `src/plugins.ts`
