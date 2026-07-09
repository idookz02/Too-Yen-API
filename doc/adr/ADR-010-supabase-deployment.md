# ADR-010: Supabase deployment

**Status:** Accepted (2026-07-09) · Amended (2026-07-10) — see [Amendment](#amendment-2026-07-10-schema-migrations--seeding-via-code)

## Context

Deploy schema จริงบน Supabase (Postgres + Storage) ตาม data-dictionary.md

## Decision

- **Project**: `too-yen` (ref `thqdxfjvlothbvybgywg`) region `ap-southeast-1` Singapore, free tier $0/เดือน
- **Auth**: ใช้ตาราง `users` เองตาม ERD — ไม่ใช้ Supabase Auth; backend จัดการ hash/login/forgot-password เอง (Supabase = Postgres + Storage เท่านั้น)
- **PK**: BIGINT `generated always as identity` ตาม data dictionary
- **Migrations**: schema ตั้งต้น deploy ด้วย `init_too_yen_schema` (17 ตาราง + index + case-insensitive unique บน ingredient/unit) และ `enable_rls_all_tables` — ตั้งแต่ 2026-07-10 การเปลี่ยน schema ต่อจากนี้จัดการผ่านโค้ด (Drizzle Kit) ดู [Amendment](#amendment-2026-07-10-schema-migrations--seeding-via-code)
- **RLS เปิดทุกตารางแบบไม่มี policy** — ปิดทาง anon key ทั้งหมด; backend ต้องใช้ **service_role key** เท่านั้น (bypass RLS) และห้ามใช้ anon key คุย DB ตรงจาก frontend
- **Storage**: 3 public buckets ตาม ADR-009 — `recipe-media`, `avatars`, `comment-images`

## Consequences

- frontend เรียกผ่าน backend API เท่านั้น — จะเปิด public read ผ่าน anon key ภายหลังต้องเขียน policy เพิ่ม
- service_role key เป็นความลับระดับสูงสุด เก็บใน backend env เท่านั้น
- อัปโหลดไฟล์เข้า bucket ผ่าน backend (service role bypass storage RLS); public URL อ่านได้เสมอตาม ADR-009

## Amendment (2026-07-10): schema migrations & seeding via code

**Change:** schema และ reference/seed data จัดการผ่านโค้ดด้วย **Drizzle Kit** ได้แล้ว — เดิมถือว่า Supabase DB เป็น source of truth ที่แก้ผ่าน dashboard/SQL เท่านั้น และห้าม ORM migrate/seed

**Decision:**
- **Schema เป็นโค้ด (authoritative going forward):** แก้ที่ `src/db/schema/` → `bun run db:generate` เพื่อสร้างไฟล์ SQL migration ใน `drizzle/` → **review** SQL → `bun run db:migrate` เพื่อ apply. Drizzle schema ในโค้ดคือคำนิยามหลักนับจากนี้
- **Seed:** ข้อมูลอ้างอิง/ข้อมูล dev seed ผ่าน `bun run db:seed` (insert แบบ idempotent)
- `db:push` ใช้กับ throwaway/branch DB เท่านั้น (ไม่มี migration history)

**Consequence — DB ที่ deploy แล้วต้อง "baseline" ก่อน:**
- Production DB มี 17 ตารางอยู่แล้ว (จาก `init_too_yen_schema`) — ถ้า `db:generate` migration ตั้งต้นแล้ว `db:migrate` ทับ DB จริง มันจะพยายาม `CREATE TABLE` ตารางที่มีอยู่แล้วและ **fail**
- ก่อน incremental migration จะใช้กับ DB จริงได้ ต้อง baseline ก่อน: generate migration ตั้งต้นจาก schema ปัจจุบัน แล้วบันทึกว่า "apply แล้ว" ใน journal ของ Drizzle (`__drizzle_migrations`) เพื่อให้ `migrate()` ข้าม DDL ตั้งต้นไป — การเปลี่ยน schema ครั้งถัดๆ ไปจึงจะ apply เป็น incremental ตามปกติ (ยืนยันขั้นตอน baseline กับเอกสาร Drizzle Kit ก่อนรันจริงกับ prod)
- **ไม่เปลี่ยน:** service_role-only + RLS เปิดไม่มี policy, ใช้ตาราง `users` เอง (ไม่ใช้ Supabase Auth), BIGINT identity PK, และ storage buckets

**Supersedes:** ข้อความ "NEVER run drizzle-kit push/migrate / Do NOT generate or run any migration / schema changes are out of scope" ใน `doc/api/vibe-coding-plan.md` และ `doc/api/implementation-plan.md`
