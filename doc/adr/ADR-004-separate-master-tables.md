# ADR-004: Five separate master tables

**Status:** Accepted (2026-07-09)

## Context

Master data มี 5 ชนิด: Skill Level, Cooking Time, Cooking Method, Category, Equipment — เลือกได้ระหว่างตารางเดียว + type column กับแยกตาราง

## Decision

แยก 5 ตาราง: `master_skill_level`, `master_cooking_time`, `master_cooking_method`, `master_category`, `master_equipment` โครงเหมือนกัน (id, name, is_active, created_at)

## Consequences

- FK จาก `recipe` ชี้ตรงตาราง — DB บังคับความถูกต้องเอง ชี้ข้ามชนิดไม่ได้
- Unique ชื่อต่อชนิด = unique constraint ธรรมดา
- เพิ่มชนิดใหม่ต้อง migrate schema (ยอมรับได้ — ชนิด fix ตามสเปค)
