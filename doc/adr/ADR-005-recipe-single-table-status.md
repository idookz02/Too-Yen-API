# ADR-005: Recipe = single table with status enum

**Status:** Accepted (2026-07-09)

## Context

เอกสารใช้คำว่า recipe / post สลับกัน และมี 3 สถานะ: Draft (ใน Profile เท่านั้น), Published (ขึ้น feed), Private (ซ่อนจาก feed/search/saved ของคนอื่น แต่ owner ยังเห็น)

## Decision

ตาราง `recipe` เดียว มี `status ENUM('draft','published','private')`

- Draft บันทึกได้แม้ field ไม่ครบ → attribute FK ทั้งหมด nullable, บังคับครบตอน publish ที่ระดับ app
- Delete = hard delete จริง (AC: "permanently delete") → FK ลูกทั้งหมด `ON DELETE CASCADE` เพื่อกวาด comment/like/favorite/saved ออกตามสเปค
- Publish = เปลี่ยน status + ตั้ง `published_at`

## Consequences

- ไม่มีการ copy ข้อมูลระหว่าง draft/published — แก้ที่เดียว
- Feed query = `status = 'published'`; Private กรองออกจาก saved list ของคนอื่นที่ระดับ query
