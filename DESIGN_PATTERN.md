# ElysiaJS Project Structure & Best Practices

โครงสร้างโปรเจกต์นี้ออกแบบตามหลัก Feature-Based Domain Design (แยกตามฟีเจอร์) เพื่อให้โค้ดมีความยืดหยุ่น ขยายระบบได้ง่าย (Scalable) และสามารถเขียน Unit Test ได้อย่างมีประสิทธิภาพ

## 📁 โครงสร้างโฟลเดอร์ (Project Tree)

```text
project-root/
├── src/
│   ├── modules/
│   │   ├── users/
│   │   │   ├── dto/
│   │   │   │   └── users.dto.ts       # โมเดลและ Schema สำหรับ Validation
│   │   │   ├── services/
│   │   │   │   └── users.service.ts   # Business Logic (ไม่ผูกกับ HTTP)
│   │   │   └── users.controller.ts    # กำหนด Route, Hook และเรียกใช้ Service
│   │   └── products/
│   │
│   ├── config/
│   │   └── environment.ts             # จัดการ Environment Variables
│   ├── index.ts                       # Entry Point หลักของแอปพลิเคชัน
│   └── plugins.ts                     # รวม Global Plugins (CORS, Swagger, JWT)
├── package.json
└── bun.lockb
```

---

## 💻 โดเมนตัวอย่าง: ระบบจัดการผู้ใช้ (Users Module)

### 1. Data Transfer Object (`src/modules/users/dto/users.dto.ts`)

ใช้ **TypeBox** (ติดมากับ Elysia) เพื่อทำ Request Validation และกำหนด Type ที่ปลอดภัย

```typescript
import { t } from "elysia";

export const CreateUserDTO = t.Object({
  name: t.String({
    minLength: 2,
    error: "Name must be at least 2 characters long",
  }),
  email: t.String({ format: "email", error: "Invalid email format" }),
  password: t.String({ minLength: 6 }),
});

export type CreateUserType = typeof CreateUserDTO.static;
```

### 2. Service Layer (`src/modules/users/services/users.service.ts`)

ทำหน้าที่จัดการ Business Logic และติดต่อ Database ชั้นนี้จะไม่รู้เรื่องเกี่ยวกับ HTTP Request/Response ทำให้เขียน Test ง่าย

```typescript
import type { CreateUserType } from "../dto/users.dto";

export class UsersService {
  async createUser(data: CreateUserType) {
    // ตัวอย่างการบันทึกข้อมูล (Mock DB)
    return {
      id: Math.floor(Math.random() * 1000),
      ...data,
      createdAt: new Date(),
    };
  }

  async getUserById(id: string) {
    return { id, name: "John Doe", email: "john@example.com" };
  }
}
```

### 3. Controller Layer (`src/modules/users/users.controller.ts`)

ทำหน้าที่รับ Request, กำหนด Route Path, ทำ Validation, และส่ง Response กลับ

```typescript
import { Elysia } from "elysia";
import { UsersService } from "./services/users.service";
import { CreateUserDTO } from "./dto/users.dto";

const usersService = new UsersService();

export const usersController = new Elysia({ prefix: "/users" })
  .post("/", ({ body }) => usersService.createUser(body), {
    body: CreateUserDTO,
    detail: { summary: "สร้างผู้ใช้ใหม่" }, // สำหรับ Swagger
  })
  .get("/:id", ({ params: { id } }) => usersService.getUserById(id), {
    detail: { summary: "ดึงข้อมูลผู้ใช้จาก ID" },
  });
```

---

## 🌐 ตัวอย่างไฟล์หลัก (App Configuration)

### 4. Global Plugins (`src/plugins.ts`)

แยกการตั้งค่า Middleware หลัก ๆ ออกจากไฟล์ `index.ts` เพื่อความสะอาดของโค้ด

```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";

export const globalPlugins = new Elysia().use(cors()).use(
  swagger({
    documentation: {
      info: { title: "Elysia API Documentation", version: "1.0.0" },
    },
  }),
);
```

### 5. Entry Point (`src/index.ts`)

รวมทุกอย่างเข้าด้วยกันและสั่งให้ Server ทำงาน

```typescript
import { Elysia } from "elysia";
import { globalPlugins } from "./plugins";
import { usersController } from "./modules/users/users.controller";

const app = new Elysia()
  .use(globalPlugins) // 1. โหลด Global Middleware / Plugins
  .use(usersController) // 2. โหลด API Routes (Modules)
  .listen(process.env.PORT || 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
```

---

## 🎯 กฎเหล็ก 3 ข้อสำหรับ Best Practice ของ ElysiaJS

1. **อย่าใส่ Business Logic ใน Controller:** ให้ Controller ทำหน้าที่แค่ตรวจเช็กค่าที่ส่งมา (Validation) แล้วส่งต่อให้ Service ทันที
2. **ใช้ Plugin แบบ Modular:** ทุกฟีเจอร์ย่อย (เช่น `usersController`) ควรประกาศเป็น `new Elysia()` ใหม่ เพื่อให้สามารถนำไป `.use()` ต่อกันเป็นทอด ๆ ได้ง่าย
3. **กำหนด Schema เสมอ:** การใช้ `t.Object` ในส่วนของ `body`, `query`, หรือ `params` จะช่วยตัดปัญหาเรื่อง Type Unsafe และสร้างเอกสาร Swagger ให้แบบอัตโนมัติ
