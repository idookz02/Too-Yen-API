# ADR-012: User tier from total recipe likes

**Status:** Accepted (2026-07-09)

## Context

ต้องการระดับ (tier) ของ user คำนวณจากยอดไลก์รวมทุกสูตรของ user โดยมี master กำหนดแต่ละระดับ

## Decision

- **`master_tier`** (tier_id, name unique, `min_likes` unique, is_active, created_at) — user อยู่ tier สูงสุดที่ `min_likes ≤ ยอดไลก์รวม`; Admin จัดการ + soft delete เหมือน master อื่น (ADR-003)
- **`users.tier_id`** FK nullable — denormalize เพราะยอดรวมข้ามทุกสูตรคำนวณสดแพง (ต่างจาก like count ต่อโพสต์ใน ADR-008 ที่ COUNT สด)
- **DB triggers บน Supabase อัปเดตอัตโนมัติ**: like/unlike (`recipe_like`), ลบสูตร (`recipe`), สมัครใหม่ (`users`) → เรียก `recalc_user_tier()`
- นับไลก์จาก**ทุกสูตรที่ยังอยู่ ทุกสถานะ** (draft/published/private); สูตรที่ลบ ไลก์หายตาม CASCADE → tier ลดลงได้
- Applied แล้ว: migration `add_user_tier`

## Consequences

- `tier_id` เป็น NULL ได้ถ้า `master_tier` ยังว่าง — ควร seed tier ฐาน `min_likes = 0` ให้ user ใหม่ติด tier ทันที
- Admin แก้/เพิ่ม/ปิด tier ใน master_tier **ไม่ recalc user เดิมอัตโนมัติ** — ต้องรัน `select recalc_user_tier(user_id) from users` หลังแก้
- Trigger เป็น `security definer` — ทำงานได้แม้ RLS เปิด
