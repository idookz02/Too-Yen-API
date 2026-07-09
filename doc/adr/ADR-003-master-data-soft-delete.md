# ADR-003: Soft delete for master data

**Status:** Accepted (2026-07-09)

## Context

admin-master-data AC 10: ลบ entry แล้วสูตรเดิมต้องอยู่ครบ แค่ไม่โผล่ใน selection list อีก

## Decision

ทุกตาราง master มีคอลัมน์ `is_active BOOLEAN DEFAULT TRUE` — "Delete" ของ Admin คือ set `is_active = FALSE` ไม่ลบ row จริง

## Consequences

- FK จากสูตรเดิมยังชี้ได้ ชื่อยังแสดงบน post detail ได้
- Dropdown/filter query ต้องกรอง `is_active = TRUE` เสมอ
- Duplicate check ตอน Add ต้องตัดสินใจว่า ชื่อซ้ำกับ entry ที่ inactive ให้ reactivate หรือแจ้งซ้ำ (แนะนำ: reactivate)
