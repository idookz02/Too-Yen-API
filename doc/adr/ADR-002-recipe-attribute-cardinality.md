# ADR-002: Recipe attribute cardinality

**Status:** Accepted (2026-07-09)

## Context

ฟอร์มในเอกสารเป็น select เดี่ยวทั้ง 5 attribute แต่สูตรจริงใช้อุปกรณ์หลายชิ้น

## Decision

- **Equipment = many-to-many** ผ่าน junction `recipe_equipment`
- Skill Level, Cooking Time, Cooking Method, Category = FK เดี่ยวบนตาราง `recipe`

## Consequences

- UI ฟอร์ม Equipment ต้องเปลี่ยนเป็น multi-select (ต้องอัปเดตเอกสาร create-new-recipe และ advanced-search)
- Advanced Search filter equipment ผ่าน junction
