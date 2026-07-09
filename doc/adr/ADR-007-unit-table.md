# ADR-007: Unit as a shared table with structured amount

**Status:** Accepted (2026-07-09) — supersedes quantity free-text ใน ADR-001

## Context

เดิม (ADR-001) เก็บปริมาณเป็น `quantity` free text ใน `recipe_ingredient` — ผู้ใช้ต้องการแยกหน่วยเป็นตารางเอง และให้เพิ่มหน่วยใหม่ได้แบบเดียวกับ ingredient

## Decision

- ตาราง `unit` กลาง ใช้ร่วมทุก ingredient (unit_id, name unique, created_at) โตจาก autocomplete ของ user — ไม่ผูกหน่วยต่อ ingredient รายตัว
- `recipe_ingredient` เปลี่ยนจาก `quantity VARCHAR` เป็น `amount DECIMAL` (nullable) + `unit_id FK` (nullable)

## Consequences

- ปริมาณเป็น structured — คำนวณ/scale สูตรได้ในอนาคต
- ปริมาณเชิงบรรยาย ("ตามชอบ", "หยิบมือ") พิมพ์เป็นตัวเลขไม่ได้ → ปล่อย amount/unit เป็น NULL หรือสร้าง unit ชื่อนั้นโดยไม่ใส่ amount
- ต้อง dedupe ชื่อ unit ตอน insert (case-insensitive) เหมือน ingredient
