# User Profile

## Description

Web Application

Overview

This feature allow User to view and edit their account information, view their saved recipes, and view and edit their draft recipes.
So that user able to manage their account and personal recipe collections in one place.

## Precondition

1. User connect internet / open Too-Yen web application.
2. User login by Too-Yen account.
3. User reach the Profile menu from the Home navigation.
4. Saved recipes list requires the user to have favorited at least one post; draft recipes list requires at least one saved draft.

## Method 1 : View / Edit Profile

### Screen Detail

**Page 1**: Profile page showing display name, username, and profile picture with an Edit action.

[Screenshot: Profile page with account information and Edit button]

**Page 2**: Edit Profile form with editable name and password fields.

[Screenshot: Edit Profile form with name and password fields]

### User Step

1. Navigate to the **Profile** menu.
2. Review the profile **display name**, **username**, and **picture**.
3. Click **Edit**.
4. Edit **Display Name**.
5. Edit **Password**.
6. Click **Save**.
7. Review the updated profile information.

### Acceptance Criteria

1. System display the user's display name, username, and profile picture on the Profile page.
2. When click Edit, System display the editable name and password fields.
3. System allow user to edit the display name and password.
4. When editing password, System require the new password to meet the password rules before saving.
5. When click Save, System update the profile and display the updated information.
6. System does not allow the username to be changed once the account is created.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| profile-root | Box | | Profile | Text | | Container for the user profile page. |
| profile-display-name | Text | | Display Name | Text | | Displays the user's display name. |
| profile-username | Text | | Username | Text | | Displays the user's username. |
| profile-picture | Box | | Profile Picture | Text | | Displays the user's profile picture. |
| profile-edit-btn | Button | btn-active | Edit | Button, Clickable | No | Opens the editable profile form. |
| profile-name-input | Text | input-active | Display Name | Text | Yes | Captures the edited display name. |
| profile-password-input | Text | input-active | Password | Text (masked) | No | Captures the new password. |
| profile-save-btn | Button | btn-active | Save | Button, Clickable | Yes | Saves the edited profile information. |

## Method 2 : View Saved Recipes

### Screen Detail

**Page 1**: Profile page with a Saved Recipes tab showing favorited recipe posts.

[Screenshot: Saved Recipes tab with favorited recipe cards]

### User Step

1. Navigate to the **Profile** menu.
2. Click the **Saved Recipes** tab.
3. Review the list of saved recipes.
4. Click an individual **saved recipe** to open the post detail page.
5. Optionally click the **Favorite** icon to remove the recipe from saved.

### Acceptance Criteria

1. When click Saved Recipes, System display the recipes the user has favorited.
2. When click a saved recipe, System open the post detail page.
3. When click Favorite to unsave, System remove the recipe from the saved list.
4. When no saved recipe exists, System display an empty state message.
5. System display saved recipes in descending order by saved date, latest first.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| profile-saved-tab | Button | tab-active | Saved Recipes | Button, Clickable | No | Displays the user's saved (favorited) recipes. |
| profile-saved-card | Box | recipe-card-active | Saved Recipe | Button, Clickable | No | Opens the saved recipe's post detail page. |
| profile-saved-favorite-icon | Button | favorite-active | Favorite | Button, Clickable | No | Removes the recipe from the saved list. |

## Method 3 : View / Edit Draft Recipes

### Screen Detail

**Page 1**: Profile page with a Draft Recipes tab showing the user's saved drafts.

[Screenshot: Draft Recipes tab with draft recipe cards]

**Page 2**: Create Recipe form reopened with the selected draft's saved values for editing.

[Screenshot: Create Recipe form pre-filled with draft values]

### User Step

1. Navigate to the **Profile** menu.
2. Click the **Draft Recipes** tab.
3. Review the list of draft recipes.
4. Click an individual **draft recipe**.
5. Edit the recipe values in the create-recipe form.
6. Click **Save Draft** to keep editing later, or **Publish** to post it.

### Acceptance Criteria

1. When click Draft Recipes, System display the user's saved draft recipes.
2. When click a draft recipe, System open the create-recipe form pre-filled with the draft's saved values.
3. System allow user to edit and re-save the draft.
4. When click Publish from a draft with all required fields valid, System publish the recipe and remove it from the draft list.
5. When no draft exists, System display an empty state message.
6. System does not display draft recipes on the Home feed.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| profile-draft-tab | Button | tab-active | Draft Recipes | Button, Clickable | No | Displays the user's saved draft recipes. |
| profile-draft-card | Box | recipe-card-active | Draft Recipe | Button, Clickable | No | Opens the draft in the create-recipe form for editing. |
| profile-draft-edit-btn | Button | btn-active | Edit Draft | Button, Clickable | No | Opens the draft recipe for editing. |
