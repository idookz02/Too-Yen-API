# ADR-008: Comment / Like policy

**Status:** Accepted (2026-07-09) — ขยาย ADR-006

## Context

ยืนยัน requirement: user อื่นเข้ามา like และ comment สูตรได้ — เอกสารไม่ระบุเรื่องแก้/ลบ comment, การมีส่วนร่วมกับโพสต์ตัวเอง, และวิธีนับ count

## Decision

- **Owner มีส่วนร่วมโพสต์ตัวเองได้ทุกอย่าง** (like / favorite / comment) — ไม่มีข้อห้าม
- **เจ้าของ comment แก้และลบ comment ตัวเองได้**: เพิ่ม `updated_at` (nullable, set ตอนแก้) และ `is_deleted` (soft delete) ในตาราง `comment`; เจ้าของโพสต์ลบ comment คนอื่นไม่ได้
- **Comment เป็น flat ตามเดิม** ไม่มี reply thread (เพิ่ม `parent_comment_id` ทีหลังได้)
- **Like/favorite count นับจาก junction ด้วย COUNT** ไม่ denormalize — index ที่ (recipe_id) รองรับ sort ตาม most liked/favorited

## Consequences

- Comment ที่ soft delete แล้วต้องกรอง `is_deleted = FALSE` ทุก query; hard delete ของ recipe ยัง CASCADE กวาดทิ้งจริงตามสเปค
- ถ้า feed โตจน COUNT ช้า ค่อยเพิ่ม materialized count ภายหลัง
