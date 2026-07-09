# Too-Yen — Glossary

| Term | ความหมาย | ตารางที่เกี่ยว |
|------|----------|----------------|
| Recipe / Post | สูตรอาหาร 1 รายการ — เอกสารใช้สองคำนี้แทนกัน entity เดียวกัน | `recipe` |
| Draft | สูตรที่ยังไม่เผยแพร่ เห็นเฉพาะ owner ใน Profile > Draft recipes บันทึกได้แม้ field ไม่ครบ | `recipe.status = 'draft'` |
| Published | สูตรที่เผยแพร่แล้ว แสดงบน Home feed และ search | `recipe.status = 'published'` |
| Private | สูตรที่ owner ซ่อนจาก feed/search/saved ของคนอื่น แต่ตัวเองยังเห็นและ set public กลับได้ | `recipe.status = 'private'` |
| Like | กดถูกใจโพสต์ toggle ได้ นับรวมเป็น like count | `recipe_like` |
| Favorite / Saved recipe | บันทึกโพสต์เข้าลิสต์ส่วนตัว (Profile > Saved recipes) เรียงตามวันที่ save | `recipe_favorite` |
| Comment | ความเห็นบนโพสต์ แสดง latest first พร้อม display name — แนบรูปได้ 1 รูป, เจ้าของ comment แก้/ลบ (soft delete) ของตัวเองได้ | `comment` |
| Master data | ค่ากลาง 4 ชนิดที่ Admin จัดการ: Skill Level, Cooking Method, Category, Equipment — ลบแบบ soft delete (cooking time เป็นนาทีบน recipe แทน ตาม ADR-011) | `master_*` |
| Ingredient | วัตถุดิบ — ตารางกลางที่โตจาก autocomplete ของ user ไม่ใช่ master data ของ Admin | `ingredient`, `recipe_ingredient` |
| Media | รูป/วิดีโอของสูตร — ไฟล์จริงอยู่ Supabase Storage (public bucket), DB เก็บ bucket + object path; cover 1 รูป, video ไม่เกิน 1, รูปประกอบต่อ step ได้ | `recipe_media`, `cooking_step.image_path` |
| Unit | หน่วยปริมาณของวัตถุดิบ (ช้อนโต๊ะ, กรัม, ฟอง...) — ตารางกลางใช้ร่วมทุก ingredient โตจาก autocomplete ของ user | `unit` |
| Cooking step | ขั้นตอนทำอาหาร เรียงตาม step_number | `cooking_step` |
| Recent search | คีย์เวิร์ดค้นหาล่าสุดต่อ user ลบทีละคำได้ | `recent_search` |
| Owner | user ที่สร้างสูตร — เห็นเมนู Manage (Set Private/Public, Delete) เฉพาะโพสต์ตัวเอง | `recipe.user_id` |
| Admin | บัญชี role admin เข้าถึง Master Data console ได้ | `users.role = 'admin'` |
| Tier | ระดับของ user จากยอดไลก์รวมทุกสูตร — อยู่ tier สูงสุดที่ยอดถึง min_likes, อัปเดตอัตโนมัติด้วย DB trigger | `master_tier`, `users.tier_id` |
| Display name | ชื่อที่แสดงต่อ community บนโพสต์/คอมเมนต์ แก้ได้; username แก้ไม่ได้ | `users.display_name` |
