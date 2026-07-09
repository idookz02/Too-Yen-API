# ADR-010: Supabase deployment

**Status:** Accepted (2026-07-09)

## Context

Deploy schema จริงบน Supabase (Postgres + Storage) ตาม data-dictionary.md

## Decision

- **Project**: `too-yen` (ref `thqdxfjvlothbvybgywg`) region `ap-southeast-1` Singapore, free tier $0/เดือน
- **Auth**: ใช้ตาราง `users` เองตาม ERD — ไม่ใช้ Supabase Auth; backend จัดการ hash/login/forgot-password เอง (Supabase = Postgres + Storage เท่านั้น)
- **PK**: BIGINT `generated always as identity` ตาม data dictionary
- **Migrations**: `init_too_yen_schema` (17 ตาราง + index + case-insensitive unique บน ingredient/unit), `enable_rls_all_tables`
- **RLS เปิดทุกตารางแบบไม่มี policy** — ปิดทาง anon key ทั้งหมด; backend ต้องใช้ **service_role key** เท่านั้น (bypass RLS) และห้ามใช้ anon key คุย DB ตรงจาก frontend
- **Storage**: 3 public buckets ตาม ADR-009 — `recipe-media`, `avatars`, `comment-images`

## Consequences

- frontend เรียกผ่าน backend API เท่านั้น — จะเปิด public read ผ่าน anon key ภายหลังต้องเขียน policy เพิ่ม
- service_role key เป็นความลับระดับสูงสุด เก็บใน backend env เท่านั้น
- อัปโหลดไฟล์เข้า bucket ผ่าน backend (service role bypass storage RLS); public URL อ่านได้เสมอตาม ADR-009
