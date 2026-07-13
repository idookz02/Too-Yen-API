# Too-Yen — Data Dictionary (English)

References: `too-yen-erd.mermaid`, ADR-001 – ADR-012 | Last updated 2026-07-09
Status: deployed on Supabase project `too-yen` (17 tables) — migrations: `init_too_yen_schema`, `enable_rls_all_tables`, `replace_cooking_time_master_with_minutes`, `add_recipe_description`, `add_user_tier`

Conventions: PK = Primary Key, FK = Foreign Key, UK = Unique | FK ON DELETE behavior noted per table

---

## 1. users — User accounts

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| user_id | BIGINT | NO | PK | User ID |
| email | VARCHAR(255) | NO | UK | Email, used for signup and password recovery |
| username | VARCHAR(100) | NO | UK | Login name, immutable after signup |
| password_hash | VARCHAR(255) | NO | | Hashed password (app-managed auth, not Supabase Auth) |
| display_name | VARCHAR(100) | NO | | Name shown to the community on posts and comments |
| profile_picture_path | VARCHAR(500) | YES | | Supabase Storage object path, optional (ADR-009) |
| role | ENUM('user','admin') | NO | | Access role; admin can access the Master Data console |
| tier_id | BIGINT | YES | FK → master_tier | User tier from total likes, trigger-maintained (ADR-012) |
| created_at | DATETIME | NO | | Account creation time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Constraints: UNIQUE(email), UNIQUE(username)
FK behavior: tier_id RESTRICT (master_tier uses soft delete) | trigger `user_insert_tier` assigns the base tier on signup (ADR-012)

---

## 2. master_skill_level / master_cooking_method / master_category / master_equipment — 4 master data tables (ADR-003, ADR-004, ADR-011)

Identical structure across all 4 tables; only the PK name differs (`skill_level_id`, `cooking_method_id`, `category_id`, `equipment_id`). Cooking time is no longer master data (ADR-011).

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| {x}_id | BIGINT | NO | PK | Entry ID |
| name | VARCHAR(100) | NO | UK | Entry name, unique per type |
| is_active | BOOLEAN | NO | | Soft delete — FALSE hides the entry from selection lists while existing recipe references stay intact (ADR-003) |
| created_at | DATETIME | NO | | Created time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Constraints: UNIQUE(name) per table | Admin "Delete" sets `is_active = FALSE`; rows are never physically removed

---

## 2.1 master_tier — User tiers (ADR-012)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| tier_id | BIGINT | NO | PK | Tier ID |
| name | VARCHAR(100) | NO | UK | Tier name, e.g. Rookie, Commis Chef, Sous Chef, Master Chef |
| min_likes | INT | NO | UK | Minimum total likes threshold — a user holds the highest tier whose threshold they meet |
| is_active | BOOLEAN | NO | | Soft delete, same convention as other masters (ADR-003) |
| created_at | DATETIME | NO | | Created time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Constraints: UNIQUE(name), UNIQUE(min_likes) | `users.tier_id` is maintained by triggers on recipe_like (insert/delete), recipe (delete), and users (insert) via `recalc_user_tier()` — counts likes across all existing recipes of the user, any status

---

## 3. recipe — Recipes / posts (ADR-005)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| recipe_id | BIGINT | NO | PK | Recipe ID |
| user_id | BIGINT | NO | FK → users | Owner |
| recipe_name | VARCHAR(255) | YES | | Recipe name, nullable while draft |
| description | TEXT | YES | | Recipe description, required at publish (app-enforced) |
| skill_level_id | BIGINT | YES | FK → master_skill_level | Skill level |
| cook_time_minutes | INT | YES | | Cooking time in minutes, user-entered, range-filterable in search (ADR-011) |
| servings | INT | YES | | How many servings the recipe yields, user-entered |
| cooking_method_id | BIGINT | YES | FK → master_cooking_method | Cooking method |
| category_id | BIGINT | YES | FK → master_category | Category |
| status | ENUM('draft','published','private') | NO | | Post status (ADR-005) |
| published_at | DATETIME | YES | | Publish time, feed sort key |
| created_at | DATETIME | NO | | Created time |
| updated_at | DATETIME | NO | | Last updated |

FK behavior: user_id RESTRICT (no user-deletion flow in spec); all master FKs RESTRICT (soft delete instead)
Notes: attribute FKs may be NULL only while draft — completeness enforced at publish in the app layer | Delete is a hard delete; all child tables CASCADE

---

## 4. ingredient — Shared ingredient list (ADR-001) — also an admin master (2026-07-13)

Grown from free-text on recipe save (find-or-create, ADR-001) **and** managed via admin master CRUD (`{type}=ingredients`); soft-deleted rows reactivate on reuse and are hidden from autocomplete/dropdowns.

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| ingredient_id | BIGINT | NO | PK | Ingredient ID |
| name | VARCHAR(150) | NO | UK | Ingredient name, grown from user autocomplete input |
| is_active | BOOLEAN | NO | | Soft delete (ADR-003) — hidden from selection, existing recipe references stay intact |
| created_at | DATETIME | NO | | Created time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Constraints: UNIQUE(lower(name)) — case-insensitive dedupe on insert

---

## 5. unit — Measurement units (ADR-007) — also an admin master (2026-07-13)

Grown from free-text on recipe save (find-or-create, ADR-007) **and** managed via admin master CRUD (`{type}=units`); soft-deleted rows reactivate on reuse and are hidden from autocomplete/dropdowns.

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| unit_id | BIGINT | NO | PK | Unit ID |
| name | VARCHAR(100) | NO | UK | Unit name (tbsp, gram, ...) — shared list across all ingredients, grown from autocomplete |
| is_active | BOOLEAN | NO | | Soft delete (ADR-003) — hidden from selection, existing recipe references stay intact |
| created_at | DATETIME | NO | | Created time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Constraints: UNIQUE(lower(name))

---

## 6. recipe_ingredient — Ingredients per recipe (junction, ADR-001/007)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | Recipe |
| ingredient_id | BIGINT | NO | PK, FK → ingredient | Ingredient |
| amount | DECIMAL(10,2) | YES | | Amount; NULL when unspecified (e.g. "to taste") |
| unit_id | BIGINT | YES | FK → unit | Unit |
| sort_order | INT | NO | | Display order as entered by the owner |

Constraints: PK(recipe_id, ingredient_id)
FK behavior: recipe_id CASCADE; ingredient_id RESTRICT; unit_id RESTRICT

---

## 7. recipe_equipment — Equipment per recipe (junction, ADR-002)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | Recipe |
| equipment_id | BIGINT | NO | PK, FK → master_equipment | Equipment; many per recipe |

Constraints: PK(recipe_id, equipment_id)
FK behavior: recipe_id CASCADE; equipment_id RESTRICT

---

## 8. cooking_step — Cooking steps

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| step_id | BIGINT | NO | PK | Step ID |
| recipe_id | BIGINT | NO | FK → recipe | Recipe |
| step_number | INT | NO | UK* | Sequential step number |
| instruction | TEXT | NO | | Step instruction |
| image_path | VARCHAR(500) | YES | | One image per step, Supabase object path (ADR-009) |

Constraints: *UNIQUE(recipe_id, step_number)
FK behavior: recipe_id CASCADE

---

## 9. recipe_media — Recipe images and video (ADR-009)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| media_id | BIGINT | NO | PK | Media ID |
| recipe_id | BIGINT | NO | FK → recipe | Recipe |
| media_type | ENUM('image','video') | NO | | File type — max 1 video per recipe (app-enforced) |
| bucket | VARCHAR(100) | NO | | Supabase Storage bucket (public) |
| object_path | VARCHAR(500) | NO | | Object key in the bucket — URLs are built at the app layer |
| is_cover | BOOLEAN | NO | | Cover image; only one TRUE per recipe (app-enforced) |
| sort_order | INT | NO | | Gallery order |
| created_at | DATETIME | NO | | Upload time |
| updated_at | DATETIME | NO | | Last updated, stamped by the `set_updated_at()` BEFORE UPDATE trigger |

Video (like the cover) can be attached in the same POST/PATCH /recipes multipart request via the `video` field; on PATCH it replaces the existing video (max 1 per recipe).
FK behavior: recipe_id CASCADE — files on Supabase Storage are NOT removed automatically; a cleanup job is required

---

## 10. comment — Post comments (ADR-006, ADR-008)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| comment_id | BIGINT | NO | PK | Comment ID |
| recipe_id | BIGINT | NO | FK → recipe | Post |
| user_id | BIGINT | NO | FK → users | Author; post owners may comment on their own posts |
| comment_text | TEXT | NO | | Comment text |
| image_path | VARCHAR(500) | YES | | One attached image, Supabase object path (ADR-009) |
| is_deleted | BOOLEAN | NO | | Soft delete by the comment owner — every query must filter FALSE (ADR-008) |
| created_at | DATETIME | NO | | Post time; list ordered DESC |
| updated_at | DATETIME | YES | | Set on edit; NULL = never edited |

FK behavior: recipe_id CASCADE; user_id RESTRICT | Flat — no reply threading

---

## 11. recipe_like — Likes (ADR-006, ADR-008)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | Post |
| user_id | BIGINT | NO | PK, FK → users | Liker; one like per user, toggleable |
| created_at | DATETIME | NO | | Like time |

Constraints: PK(recipe_id, user_id) | like count = COUNT over this table (not denormalized) | insert/delete fires the tier recalc trigger (ADR-012)
FK behavior: recipe_id CASCADE; user_id CASCADE

---

## 12. recipe_favorite — Saved recipes (ADR-006)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| recipe_id | BIGINT | NO | PK, FK → recipe | Post |
| user_id | BIGINT | NO | PK, FK → users | Saver |
| created_at | DATETIME | NO | | Save time; orders the saved list DESC |

Constraints: PK(recipe_id, user_id) | private posts are filtered out of other users' saved lists at query level
FK behavior: recipe_id CASCADE; user_id CASCADE

---

## 13. recent_search — Recent search keywords (ADR-006)

| Column | Type | Null | Key | Description |
|--------|------|------|-----|-------------|
| search_id | BIGINT | NO | PK | Search ID |
| user_id | BIGINT | NO | FK → users | Owner |
| keyword | VARCHAR(255) | NO | UK* | Keyword; removable individually |
| searched_at | DATETIME | NO | | Last searched; updated on repeat search |

Constraints: *UNIQUE(user_id, keyword)
FK behavior: user_id CASCADE
