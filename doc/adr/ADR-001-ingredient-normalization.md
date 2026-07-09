# ADR-001: Normalize Ingredient into a shared table

**Status:** Accepted (2026-07-09) — ส่วน quantity free-text ถูกแทนด้วย amount + unit ใน ADR-007

## Context

เอกสาร create-new-recipe ระบุ ingredient เป็น autocomplete free-text และไม่อยู่ใน Admin master data แต่ advanced-search ต้อง filter ตาม ingredient ได้ ถ้าเก็บเป็น text ล้วน การ filter จะเพี้ยนจากการสะกดต่างกัน

## Decision

สร้างตาราง `ingredient` กลาง (โตจากที่ user พิมพ์ผ่าน autocomplete, ชื่อ unique) และ junction `recipe_ingredient` เก็บลำดับ (`sort_order`) กับปริมาณ (`quantity` เป็น free text, nullable — เอกสารไม่บังคับ)

## Consequences

- Advanced Search filter ด้วย `ingredient_id` ได้แม่นยำ
- Autocomplete ดึงจากตาราง `ingredient` ตรงตามสเปค
- ต้องมี logic dedupe ชื่อ ingredient ตอน insert (case-insensitive)
