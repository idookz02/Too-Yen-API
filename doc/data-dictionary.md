# Too-Yen — Data Dictionary

อ้างอิง: `too-yen-erd.mermaid`, ADR-001 – ADR-012 | อัปเดตล่าสุด 2026-07-09
สถานะ: deploy แล้วบน Supabase project `too-yen` (17 ตาราง) — migrations: `init_too_yen_schema`, `enable_rls_all_tables`, `replace_cooking_time_master_with_minutes`, `add_recipe_description`, `add_user_tier`

Conventions: PK = Primary Key, FK = Foreign Key, UK = Unique | ทุก FK ระบุ ON DELETE behavior ไว้ท้ายตาราง

---

## 1. users — บัญชีผู้ใช้ / User accounts

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| user_id | BIGINT | NO | PK | รหัสผู้ใช้ / User ID |
| email | VARCHAR(255) | NO | UK | อีเมล ใช้สมัครและกู้รหัสผ่าน / Email, used for signup & password recovery |
| username | VARCHAR(100) | NO | UK | ชื่อล็อกอิน แก้ไม่ได้หลังสมัคร / Login name, immutable after signup |
| password_hash | VARCHAR(255) | NO | | รหัสผ่านแบบ hash / Hashed password |
| display_name | VARCHAR(100) | NO | | ชื่อที่แสดงบนโพสต์และคอมเมนต์ / Name shown to the community |
| profile_picture_path | VARCHAR(500) | YES | | Supabase object path ของรูปโปรไฟล์ (optional) / Profile image object path (ADR-009) |
| role | ENUM('user','admin') | NO | | สิทธิ์; admin เข้าถึง Master Data console / Access role |
| tier_id | BIGINT | YES | FK → master_tier | ระดับ user จากยอดไลก์รวม อัปเดตอัตโนมัติด้วย trigger / User tier, trigger-maintained (ADR-012) |
| created_at | DATETIME | NO | | วันที่สร้างบัญชี / Account creation time |

Constraints: UNIQUE(email), UNIQUE(username)
FK behavior: tier_id RESTRICT (master_tier ใช้ soft delete) | trigger `user_insert_tier` ตั้ง tier ฐานให้ทันทีตอนสมัคร (ADR-012)

---

## 2. master_skill_level / master_cooking_method / master_category / master_equipment — ข้อมูลหลัก 4 ตาราง (ADR-003, ADR-004, ADR-011)

โครงเหมือนกันทั้ง 4 ตาราง ต่างกันแค่ชื่อ PK (`skill_level_id`, `cooking_method_id`, `category_id`, `equipment_id`) — cooking time ไม่เป็น master แล้ว (ADR-011)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| {x}_id | BIGINT | NO | PK | รหัส entry / Entry ID |
| name | VARCHAR(100) | NO | UK | ชื่อ entry ห้ามซ้ำในชนิดเดียวกัน / Entry name, unique per type |
| is_active | BOOLEAN | NO | | soft delete — FALSE = ซ่อนจาก dropdown แต่สูตรเดิมยังอ้างได้ / Hidden from selection, existing refs intact (ADR-003) |
| created_at | DATETIME | NO | | วันที่สร้าง / Created time |

Constraints: UNIQUE(name) ต่อตาราง | Admin "Delete" = `is_active = FALSE` ไม่ลบ row จริง

---

## 2.1 master_tier — ระดับ user (ADR-012)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| tier_id | BIGINT | NO | PK | รหัส tier / Tier ID |
| name | VARCHAR(100) | NO | UK | ชื่อระดับ เช่น Rookie, Commis Chef, Sous Chef, Master Chef / Tier name |
| min_likes | INT | NO | UK | ยอดไลก์รวมขั้นต่ำ — user อยู่ tier สูงสุดที่ผ่านเกณฑ์ / Min total likes threshold |
| is_active | BOOLEAN | NO | | soft delete เหมือน master อื่น / Soft delete (ADR-003) |
| created_at | DATETIME | NO | | วันที่สร้าง / Created time |

Constraints: UNIQUE(name), UNIQUE(min_likes) | `users.tier_id` อัปเดตด้วย trigger บน recipe_like (insert/delete), recipe (delete), users (insert) ผ่านฟังก์ชัน `recalc_user_tier()` — นับไลก์ทุกสูตรที่ยังอยู่ทุกสถานะ

---

## 3. recipe — สูตรอาหาร / โพสต์ (ADR-005)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK | รหัสสูตร / Recipe ID |
| user_id | BIGINT | NO | FK → users | เจ้าของสูตร / Owner |
| recipe_name | VARCHAR(255) | YES | | ชื่อสูตร (ว่างได้ตอน draft) / Recipe name, nullable while draft |
| description | TEXT | YES | | คำบรรยายสูตร ไม่บังคับ (ไม่เช็คตอน publish) / Recipe description, optional (not gated at publish) |
| skill_level_id | BIGINT | YES | FK → master_skill_level | ระดับความยาก / Skill level |
| cook_time_minutes | INT | YES | | เวลาปรุงเป็นนาที user กรอกเอง ค้นหาแบบช่วงได้ / Cooking time in minutes, range-filterable (ADR-011) |
| category_id | BIGINT | YES | FK → master_category | หมวดหมู่ / Category |
| status | ENUM('draft','published','private') | NO | | สถานะโพสต์ / Post status (ADR-005) |
| published_at | DATETIME | YES | | วันที่เผยแพร่ ใช้เรียง feed / Publish time, feed sort key |
| created_at | DATETIME | NO | | วันที่สร้าง / Created time |
| updated_at | DATETIME | NO | | วันที่แก้ล่าสุด / Last updated |

FK behavior: user_id RESTRICT (สเปคยังไม่มี flow ลบ user); master FK ทั้ง 3 = RESTRICT (ใช้ soft delete แทน)
หมายเหตุ: attribute FK เป็น NULL ได้เฉพาะ draft — บังคับครบตอน publish ที่ระดับ app | Delete = hard delete, ลูกทุกตาราง CASCADE

---

## 4. ingredient — วัตถุดิบกลาง (ADR-001)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| ingredient_id | BIGINT | NO | PK | รหัสวัตถุดิบ / Ingredient ID |
| name | VARCHAR(150) | NO | UK | ชื่อวัตถุดิบ โตจาก autocomplete ของ user / Grown from user autocomplete |
| created_at | DATETIME | NO | | วันที่สร้าง / Created time |

Constraints: UNIQUE(name) — dedupe แบบ case-insensitive ตอน insert

---

## 5. unit — หน่วยปริมาณ (ADR-007)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| unit_id | BIGINT | NO | PK | รหัสหน่วย / Unit ID |
| name | VARCHAR(50) | NO | UK | ชื่อหน่วย (ช้อนโต๊ะ, กรัม...) ลิสต์กลางใช้ร่วมทุกวัตถุดิบ / Shared unit list, grown from autocomplete |
| created_at | DATETIME | NO | | วันที่สร้าง / Created time |

Constraints: UNIQUE(name)

---

## 6. recipe_ingredient — วัตถุดิบในสูตร (junction, ADR-001/007)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | สูตร / Recipe |
| ingredient_id | BIGINT | NO | PK, FK → ingredient | วัตถุดิบ / Ingredient |
| amount | DECIMAL(10,2) | YES | | ปริมาณ (NULL = ไม่ระบุ เช่น "ตามชอบ") / Amount, NULL for unspecified |
| unit_id | BIGINT | YES | FK → unit | หน่วย / Unit |
| sort_order | INT | NO | | ลำดับแสดงผลตามที่ owner กรอก / Display order as entered |

Constraints: PK(recipe_id, ingredient_id)
FK behavior: recipe_id CASCADE; ingredient_id RESTRICT; unit_id RESTRICT

---

## 7. recipe_equipment — อุปกรณ์ของสูตร (junction, ADR-002)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | สูตร / Recipe |
| equipment_id | BIGINT | NO | PK, FK → master_equipment | อุปกรณ์ (หลายชิ้นต่อสูตร) / Equipment, many per recipe |

Constraints: PK(recipe_id, equipment_id)
FK behavior: recipe_id CASCADE; equipment_id RESTRICT

---

## 7b. recipe_cooking_method — วิธีปรุงของสูตร (junction, 2026-07-17)

แทน FK เดี่ยว `recipe.cooking_method_id` เดิม: 1 สูตรใส่วิธีปรุงได้มากกว่า 1 / migration `doc/supabase/007_recipe_cooking_method.sql`.

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | สูตร / Recipe |
| cooking_method_id | BIGINT | NO | PK, FK → master_cooking_method | วิธีปรุง (หลายวิธีต่อสูตร) / Cooking method, many per recipe |

Constraints: PK(recipe_id, cooking_method_id)
FK behavior: recipe_id CASCADE; cooking_method_id RESTRICT

---

## 8. cooking_step — ขั้นตอนทำอาหาร

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| step_id | BIGINT | NO | PK | รหัสขั้นตอน / Step ID |
| recipe_id | BIGINT | NO | FK → recipe | สูตร / Recipe |
| step_number | INT | NO | UK* | ลำดับขั้นตอน / Sequential step number |
| instruction | TEXT | NO | | รายละเอียดขั้นตอน / Step instruction |
| image_path | VARCHAR(500) | YES | | รูปประกอบ 1 รูปต่อ step, Supabase object path / Step image (ADR-009) |

Constraints: *UNIQUE(recipe_id, step_number)
FK behavior: recipe_id CASCADE

---

## 9. recipe_media — รูป/วิดีโอของสูตร (ADR-009)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| media_id | BIGINT | NO | PK | รหัสไฟล์ / Media ID |
| recipe_id | BIGINT | NO | FK → recipe | สูตร / Recipe |
| media_type | ENUM('image','video') | NO | | ชนิดไฟล์ — video ไม่เกิน 1 ต่อสูตร (บังคับที่ app) / Max 1 video per recipe, app-enforced |
| bucket | VARCHAR(100) | NO | | Supabase Storage bucket (public) |
| object_path | VARCHAR(500) | NO | | object key ในบัคเก็ต — สร้าง URL ที่ app layer / Object key, URL built at app layer |
| is_cover | BOOLEAN | NO | | รูปหน้าปก TRUE ได้รูปเดียวต่อสูตร (บังคับที่ app) / One cover per recipe, app-enforced |
| sort_order | INT | NO | | ลำดับ gallery / Gallery order |
| created_at | DATETIME | NO | | วันที่อัปโหลด / Upload time |

FK behavior: recipe_id CASCADE — ไฟล์บน Supabase ไม่หายเอง ต้องมี cleanup job

---

## 10. comment — ความเห็นบนโพสต์ (ADR-006, ADR-008)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| comment_id | BIGINT | NO | PK | รหัสคอมเมนต์ / Comment ID |
| recipe_id | BIGINT | NO | FK → recipe | โพสต์ / Post |
| user_id | BIGINT | NO | FK → users | ผู้เขียน (owner โพสต์คอมเมนต์เองได้) / Author, post owner may comment own post |
| comment_text | TEXT | NO | | ข้อความ / Comment text |
| image_path | VARCHAR(500) | YES | | รูปแนบ 1 รูป, Supabase object path / One attached image (ADR-009) |
| is_deleted | BOOLEAN | NO | | soft delete โดยเจ้าของคอมเมนต์ — query ต้องกรอง FALSE เสมอ / Soft delete by comment owner (ADR-008) |
| created_at | DATETIME | NO | | เวลาโพสต์ เรียงลิสต์ DESC / Post time, list ordered DESC |
| updated_at | DATETIME | YES | | เวลาแก้ล่าสุด (NULL = ไม่เคยแก้) / Set on edit |

FK behavior: recipe_id CASCADE; user_id RESTRICT | Flat — ไม่มี reply thread

---

## 11. recipe_like — การกดไลก์ (ADR-006, ADR-008)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | โพสต์ / Post |
| user_id | BIGINT | NO | PK, FK → users | ผู้กดไลก์ 1 คนไลก์ได้ 1 ครั้ง toggle ได้ / One like per user, toggleable |
| created_at | DATETIME | NO | | เวลากดไลก์ / Like time |

Constraints: PK(recipe_id, user_id) | like count = COUNT จากตารางนี้ (ไม่ denormalize)
FK behavior: recipe_id CASCADE; user_id CASCADE

---

## 12. recipe_favorite — การบันทึกสูตร (ADR-006)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | โพสต์ / Post |
| user_id | BIGINT | NO | PK, FK → users | ผู้บันทึก / Saver |
| created_at | DATETIME | NO | | เวลาบันทึก ใช้เรียง saved list DESC / Save time, orders saved list |

Constraints: PK(recipe_id, user_id) | โพสต์ private ถูกกรองออกจาก saved list ของคนอื่นที่ระดับ query
FK behavior: recipe_id CASCADE; user_id CASCADE

---

## 13. recent_search — คีย์เวิร์ดค้นหาล่าสุด (ADR-006)

| Column | Type | Null | Key | Description (TH / EN) |
|--------|------|------|-----|------------------------|
| search_id | BIGINT | NO | PK | รหัส / Search ID |
| user_id | BIGINT | NO | FK → users | เจ้าของประวัติ / Owner |
| keyword | VARCHAR(255) | NO | UK* | คีย์เวิร์ด ลบทีละคำได้ / Keyword, removable individually |
| searched_at | DATETIME | NO | | เวลาค้นล่าสุด (อัปเดตเมื่อค้นซ้ำ) / Last searched, updated on repeat |

Constraints: *UNIQUE(user_id, keyword)
FK behavior: user_id CASCADE
