# ADR-006: Engagement and auxiliary tables

**Status:** Accepted (2026-07-09)

## Decision

- **Like / Favorite แยกกัน**: `recipe_like` และ `recipe_favorite` เป็น junction (recipe_id, user_id, created_at) PK ประกอบ — toggle ได้, `created_at` ของ favorite ใช้เรียง saved list (user-profile AC 5), นับ count ใช้เรียง feed (home-menu AC 7)
- **Comment**: flat table (ไม่มี reply thread — เอกสารไม่ระบุ) เรียง `created_at` DESC
- **Recent search**: `recent_search` ต่อ user เก็บ keyword, unique (user_id, keyword), มีปุ่ม remove ต่อ keyword
- **Role**: users ตารางเดียว มี `role ENUM('user','admin')` — Admin console เช็ค role

## Consequences

- ไม่มีตาราง admin แยก; ไม่มี comment threading — ถ้าอนาคตต้องมี reply ให้เพิ่ม parent_comment_id
