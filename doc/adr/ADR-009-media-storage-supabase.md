# ADR-009: Media files on Supabase Storage, DB stores paths only

**Status:** Accepted (2026-07-09)

## Context

ไม่ต้องการเก็บ image/video ใน DB โดยตรง — ไฟล์จริงอยู่ Supabase Storage และขยายสเปคจากเดิม (cover 1 รูป + video 1 ไฟล์) เป็นหลายรูป + รูปประกอบต่อ cooking step

## Decision

- **DB เก็บ `bucket` + `object_path`** ไม่เก็บ full URL — สร้าง public URL ที่ app layer ย้าย project/CDN ได้โดยไม่ migrate ข้อมูล
- **Public bucket** ยอมรับ risk: คนที่เคยมี URL ยังเปิดไฟล์ของโพสต์ Draft/Private ได้ แต่หน้าโพสต์ถูกซ่อนตามสิทธิ์ปกติ (เหมาะ MVP; ถ้าต้องการปิดจริงค่อยย้ายเป็น private + signed URL)
- **ตาราง `recipe_media`** (media_id, recipe_id, media_type image|video, bucket, object_path, is_cover, sort_order) แทนคอลัมน์ picture_url / video_url เดิม — รองรับ gallery หลายรูป; video ยังจำกัด 1 ไฟล์ต่อสูตร และ is_cover TRUE ได้รูปเดียว (บังคับที่ app)
- **`cooking_step.image_path`** (nullable) รูปประกอบต่อขั้นตอน ใช้ bucket เดียวกับ recipe_media
- **`users.profile_picture_path`** เปลี่ยนจาก URL เป็น object path ให้สอดคล้องกัน
- **`comment.image_path`** (nullable) — comment แนบรูปได้ 1 รูป bucket เดียวกัน

## Consequences

- ลบ recipe (hard delete) → row ใน recipe_media หายตาม CASCADE แต่**ไฟล์บน Supabase ไม่หายเอง** ต้องมี cleanup job/trigger เรียก Storage API ลบไฟล์
- เอกสาร create-new-recipe ต้องเพิ่ม field อัปโหลดรูป (gallery + ต่อ step) — สเปคเดิมมีแค่ video
