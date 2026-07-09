# Admin — Master Data Management

## Description

Web Application

Overview

This feature allow Admin to add and manage the master data used across the application — skill level, cooking time, cooking method, category, and equipment.
So that user able to select these values when creating recipes and filtering in advanced search.

## Precondition

1. Admin connect internet / open Too-Yen web application.
2. Admin login by Admin account with admin role.
3. System display the Admin master data console; the console is not accessible to standard User accounts.
4. Master data entries are shared application-wide and become immediately available in the User app once added.

## Method 1 : Manage Master Data

### Screen Detail

**Page 1**: Admin master data console showing a data-type selector (Skill Level, Cooking Time, Cooking Method, Category, Equipment) and the list of existing entries for the selected type.

[Screenshot: Admin master data console with data-type tabs and entry list]

**Page 2**: Add / Edit master data form with the entry name field and Save button.

[Screenshot: Add master data form with entry name field]

### User Step

1. Login as **Admin**.
2. Navigate to the **Master Data** console.
3. Select a **data type**: Skill Level, Cooking Time, Cooking Method, Category, or Equipment.
4. Review the list of existing entries.
5. Click **Add**.
6. Enter the **Entry Name**.
7. Click **Save**.
8. Review the new entry in the list.
9. Optionally click **Edit** or **Delete** on an existing entry.
10. When click **Delete**, review the confirmation dialog.
11. Click **Confirm** to remove the entry.
12. Review the entry removed from the list and the success message.

### Acceptance Criteria

1. System display the Master Data console only to Admin role accounts.
2. System display a data-type selector for Skill Level, Cooking Time, Cooking Method, Category, and Equipment.
3. When select a data type, System display the existing entries for that type.
4. When click Add and enter an Entry Name, System save the new entry to the selected data type.
5. System require the Entry Name and prevent saving a duplicate entry within the same data type.
6. When click Edit, System allow the Admin to update an existing entry name.
7. When click Delete, System display a confirmation dialog before removing the entry; when the entry is in use by a recipe, System display a warning in the dialog.
8. When Admin click Confirm on the delete dialog, System remove the entry from the selected data type, refresh the entry list, and display a success message.
9. When Admin click Cancel on the delete dialog, System close the dialog and keep the entry unchanged.
10. When the removed entry was in use by existing recipes, System keep those recipes intact and only remove the entry from future selection lists.
11. System make added master data immediately available in the Create Recipe form and Advanced Search filters.
12. System display master data entries in ascending order by name.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| admin-masterdata-root | Box | | Master Data Console | Text | | Container for the admin master data console. |
| admin-datatype-skill-level | Button | tab-active | Skill Level | Button, Clickable | No | Selects the Skill Level master data list. |
| admin-datatype-cooking-time | Button | tab-active | Cooking Time | Button, Clickable | No | Selects the Cooking Time master data list. |
| admin-datatype-cooking-method | Button | tab-active | Cooking Method | Button, Clickable | No | Selects the Cooking Method master data list. |
| admin-datatype-category | Button | tab-active | Category | Button, Clickable | No | Selects the Category master data list. |
| admin-datatype-equipment | Button | tab-active | Equipment | Button, Clickable | No | Selects the Equipment master data list. |
| admin-masterdata-list | Box | | Entry List | Text | | Displays existing entries for the selected data type. |
| admin-masterdata-add-btn | Button | btn-active | Add | Button, Clickable | No | Opens the add master data form. |
| admin-masterdata-name-input | Text | input-active | Entry Name | Text | Yes | Captures the master data entry name. |
| admin-masterdata-save-btn | Button | btn-active | Save | Button, Clickable | Yes | Saves the master data entry. |
| admin-masterdata-edit-btn | Button | btn-active | Edit | Button, Clickable | No | Opens an existing entry for editing. |
| admin-masterdata-delete-btn | Button | btn-active | Delete | Button, Clickable | No | Opens the delete confirmation dialog for an existing entry. |
| admin-masterdata-delete-confirm-btn | Button | btn-active | Confirm | Button, Clickable | No | Confirms and removes the entry, then refreshes the list. |
| admin-masterdata-delete-cancel-btn | Button | btn-active | Cancel | Button, Clickable | No | Cancels the deletion and keeps the entry unchanged. |
