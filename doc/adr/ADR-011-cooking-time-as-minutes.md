# ADR-011: Cooking time = minutes on recipe, drop master_cooking_time

**Status:** Accepted (2026-07-09) — แก้ ADR-002/ADR-004 บางส่วน

## Context

ผู้ใช้ตัดสินใจไม่ใช้ master data สำหรับเวลาปรุง — Admin ไม่ต้องดูแลลิสต์ช่วงเวลา

## Decision

- Drop ตาราง `master_cooking_time` และคอลัมน์ `recipe.cooking_time_id`
- แทนด้วย `recipe.cook_time_minutes INT` (nullable ตอน draft) — user กรอกตัวเลขนาทีเอง
- Master data เหลือ 4 ชนิด: Skill Level, Cooking Method, Category, Equipment
- Applied บน Supabase แล้ว: migration `replace_cooking_time_master_with_minutes`

## Consequences

- Advanced Search เปลี่ยนจาก select ค่า master เป็น **range filter** (เช่น ≤ 30 นาที) — ต้องแก้เอกสาร advanced-search
- เอกสารที่อ้าง cooking time master ต้องอัปเดต: create-new-recipe, advanced-search, admin-master-data, post-detail
- Admin console เหลือ tab เดียวน้อยลง (4 ชนิด)
