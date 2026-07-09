# Create New Recipe

## Description

Web Application

Overview

This feature allow User to create a new recipe by entering the recipe name, attributes, ingredients, cooking steps, and video, then save it as a draft or publish it to the community.
So that user able to share their own recipes with the Too-Yen community.

## Precondition

1. User connect internet / open Too-Yen web application.
2. User login by Too-Yen account.
3. Admin master data for skill level, cooking method, cooking time, category, and equipment must be available to populate the selection fields.
4. User reach the create-recipe form from the Home menu Create Recipe button.

## Method 1 : Save Draft Recipe

### Screen Detail

**Page 1**: Create Recipe form showing recipe name, attribute selectors, ingredient list, cooking steps, video upload, and Save Draft / Publish buttons.

[Screenshot: Create Recipe form with all input sections]

### User Step

1. Click **Create Recipe** on the Home menu.
2. Enter **Recipe Name**.
3. Select **Skill Level**.
4. Select **Cooking Method**.
5. Select **Cooking Time**.
6. Select **Category**.
7. Select **Equipment**.
8. Add one or more **Ingredient** items.
9. Add one or more **Cooking Step** items.
10. Upload **Video**.
11. Click **Save Draft**.
12. Review the recipe saved under **Profile > Draft recipes**.

### Acceptance Criteria

1. System populate Skill Level, Cooking Method, Cooking Time, Category, and Equipment options from Admin master data.
2. System allow user to add multiple ingredients to the ingredient list.
3. System allow user to add multiple cooking steps in sequential order.
4. System allow user to upload one video to the recipe.
5. When click Save Draft, System save the recipe as a draft even when required fields are incomplete.
6. System store the draft under the user's Profile draft recipes list and does not display it on the Home feed.
7. System allow user to reopen and continue editing a saved draft.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| recipe-form-root | Box | | Create Recipe Form | Text | | Container for the create-recipe form. |
| recipe-name-input | Text | input-active | Recipe Name | Text | Yes | Captures the recipe name. |
| recipe-skill-level-select | Box | select-active | Skill Level | Button, Clickable | Yes | Selects the skill level from master data. |
| recipe-cooking-method-select | Box | select-active | Cooking Method | Button, Clickable | Yes | Selects the cooking method from master data. |
| recipe-cooking-time-select | Box | select-active | Cooking Time | Button, Clickable | Yes | Selects the cooking time from master data. |
| recipe-category-select | Box | select-active | Category | Button, Clickable | Yes | Selects the recipe category from master data. |
| recipe-equipment-select | Box | select-active | Equipment | Button, Clickable | Yes | Selects the cooking equipment from master data. |
| recipe-ingredient-input | Text | input-active | Ingredient | Autocomplete text | Yes | Captures each ingredient added to the recipe. |
| recipe-ingredient-add-btn | Button | btn-active | Add Ingredient | Button, Clickable | No | Adds an ingredient row to the ingredient list. |
| recipe-step-input | Text | input-active | Cooking Step | Text | Yes | Captures each cooking step. |
| recipe-step-add-btn | Button | btn-active | Add Step | Button, Clickable | No | Adds a cooking step row in sequential order. |
| recipe-video-upload | Box | upload-active | Video | Button, Clickable | No | Uploads a video to the recipe. |
| recipe-save-draft-btn | Button | btn-active | Save Draft | Button, Clickable | No | Saves the recipe as a draft. |

## Method 2 : Publish Recipe

### Screen Detail

**Page 1**: Create Recipe form completed with all required fields, ready to publish.

[Screenshot: Completed Create Recipe form with Publish button enabled]

### User Step

1. Complete the **Create Recipe** form with all required fields.
2. Click **Publish**.
3. Review the validation result.
4. Review the recipe posted on the **Home** feed.

### Acceptance Criteria

1. System require Recipe Name, Skill Level, Cooking Method, Cooking Time, Category, Equipment, at least one Ingredient, and at least one Cooking Step before publishing.
2. When click Publish with incomplete required fields, System display validation messages and does not publish.
3. When click Publish with all required fields valid, System publish the recipe and display it on the Home feed.
4. System set the recipe owner to the current user and display the user's display name as the author.
5. When a draft is published, System remove it from the draft list and move it to the published feed.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| recipe-publish-btn | Button | btn-active | Publish | Button, Clickable | Yes | Validates required fields and publishes the recipe to the Home feed. |
| recipe-validation-message | Text | validation-active | Validation Message | Text | | Displays required-field validation messages on publish. |

## Method 3 : Manage Published Post (Set Private / Delete)

### Screen Detail

**Page 1**: Published recipe post owned by the user, showing a Manage / more-options menu with Set Private and Delete actions.

[Screenshot: Owned recipe post with manage options menu open]

**Page 2**: Delete confirmation dialog with Confirm and Cancel buttons.

[Screenshot: Delete post confirmation dialog]

### User Step

1. Open an owned **published recipe post**.
2. Click the **Manage** (more-options) menu.
3. To hide the post, click **Set Private**.
4. Review the post removed from the public Home feed and marked as Private.
5. To restore visibility, click **Set Public**.
6. To remove the post, click **Delete**.
7. Review the confirmation dialog.
8. Click **Confirm** to delete the post.
9. Review the post removed and the success message.

### Acceptance Criteria

1. System display the Manage menu with Set Private and Delete actions only to the recipe owner.
2. When click Set Private, System change the post visibility to Private and remove it from the public Home feed and search results.
3. System keep a Private post visible to the owner under Profile so the owner can view or set it public again.
4. When click Set Public on a Private post, System restore the post to the public Home feed.
5. When another user had favorited the post before it was set Private, System hide the Private post from that user's saved recipes while it remains Private.
6. When click Delete, System display a confirmation dialog before removing the post.
7. When click Confirm, System permanently delete the post, remove it from the feed, search, and all users' saved recipes, and display a success message.
8. When click Cancel, System close the dialog and keep the post unchanged.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| post-manage-menu | Button | menu-active | Manage | Button, Clickable | No | Opens the owner's post-management menu. |
| post-set-private-btn | Button | btn-active | Set Private | Button, Clickable | No | Changes the post visibility to Private and hides it from the public feed. |
| post-set-public-btn | Button | btn-active | Set Public | Button, Clickable | No | Restores a Private post to the public feed. |
| post-delete-btn | Button | btn-active | Delete | Button, Clickable | No | Opens the delete confirmation dialog. |
| post-delete-confirm-btn | Button | btn-active | Confirm | Button, Clickable | No | Permanently deletes the post and refreshes the view. |
| post-delete-cancel-btn | Button | btn-active | Cancel | Button, Clickable | No | Cancels the deletion and keeps the post unchanged. |
