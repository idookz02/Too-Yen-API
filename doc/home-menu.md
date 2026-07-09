# Home Menu

## Description

Web Application

Overview

This feature allow User to view shared recipes in a community feed, engage with each post through comments and favorites, and enter the create-recipe and search flows.
So that user able to discover, share, and save recipes made from the ingredients they have.

## Precondition

1. User connect internet / open Too-Yen web application.
2. User login by Too-Yen account.
3. System default menu as Home after successful login.
4. At least one published recipe must exist for the feed to display content; otherwise System display an empty state.

## Method 1 : View Post

### Screen Detail

**Page 1**: Home feed showing published recipe posts with author, picture, recipe name, and engagement actions.

[Screenshot: Home feed list of recipe posts with comment and favorite icons]

**Page 2**: Recipe detail page showing full ingredients, cooking steps, and video.

[Screenshot: Recipe detail page opened from a feed post]

### User Step

1. Login to Too-Yen web application.
2. Review the **Home** menu displayed as the default page.
3. Scroll the recipe feed.
4. Click an individual **recipe post**.
5. Review the recipe detail page.
6. On an owned post card, click the **Manage** menu.
7. Click **Set Private** to hide the post, or **Delete** to remove it.
8. When deleting, review the confirmation dialog and click **Confirm**.

### Acceptance Criteria

1. System default menu as Home after login.
2. System display published recipe posts in the feed with author, recipe picture, and recipe name.
3. When no post exists, System display an empty state message.
4. When click a recipe post, System open the recipe detail page with ingredients, cooking steps, and video.
5. System allow user to like and save (favorite) a post directly from the feed without opening the detail page.
6. System default display posts in descending order by post date, newest first.
7. System allow user to optionally customize the post order by post date (newest first), most liked, or most favorited.
8. System display a Manage menu on the owner's own post cards in the feed with Set Private and Delete actions.
9. When the owner click Set Private from the feed, System hide the post from the public feed and search while keeping it under the owner's Profile.
10. When the owner click Delete from the feed, System display a confirmation dialog; on Confirm, System remove the post from the feed, search, and all users' saved recipes and display a success message.
11. System display the Manage menu only on posts owned by the current user; other users' posts show like, favorite, and comment only.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| home-feed-root | Box | | Home Feed | Text | | Container that lists all published recipe posts. |
| home-recipe-card | Box | recipe-card-active | Recipe Post | Button, Clickable | | Opens the recipe detail page when clicked. |
| home-recipe-title | Text | | Recipe Name | Text | | Displays the recipe name on the post. |
| home-recipe-author | Text | | Author | Text | | Displays the display name of the recipe owner. |
| home-feed-like-icon | Button | like-active | Like | Button, Clickable | No | Likes or unlikes the post directly from the feed. |
| home-feed-favorite-icon | Button | favorite-active | Favorite | Button, Clickable | No | Saves or unsaves the post to favorites directly from the feed. |
| home-feed-sort-select | Box | sort-active | Sort By | Button, Clickable | No | Customizes post order: newest first, most liked, or most favorited. |
| home-feed-manage-menu | Button | menu-active | Manage | Button, Clickable | No | Opens the owner's Set Private / Delete menu on their own post card. Owner only. |
| home-feed-set-private-btn | Button | btn-active | Set Private | Button, Clickable | No | Hides the owner's post from the public feed and search. |
| home-feed-delete-btn | Button | btn-active | Delete | Button, Clickable | No | Opens the delete confirmation dialog for the owner's post. |

## Method 2 : Comment Post

### Screen Detail

**Page 1**: Home feed showing recipe posts. The comment field is not visible at the feed level.

[Screenshot: Home feed with recipe posts, no comment field shown]

**Page 2**: Recipe detail page opened from a post, showing the comment field and existing comment list.

[Screenshot: Recipe detail page with comment input field and comment list]

### User Step

1. Review the **Home** feed.
2. Click an individual **recipe post** to open the recipe detail page.
3. Review the **Comment** field displayed on the detail page.
4. Click the **Comment** field.
5. Enter comment text.
6. Click **Send**.
7. Review the comment displayed at the top of the comment list.

### Acceptance Criteria

1. System does not display the comment field on the Home feed.
2. When click an individual recipe post, System open the recipe detail page and display the comment field and existing comments.
3. System require comment text before enabling Send.
4. When click Send, System save the comment and display it in the comment list with the user's display name.
5. System display comments in descending order by time, latest first.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| post-comment-input | Text | input-active | Comment | Text | Yes | Captures the comment text for the post. |
| post-comment-send-btn | Button | btn-active | Send | Button, Clickable | Yes | Submits the comment to the post. |
| post-comment-list | Box | | Comment List | Text | | Displays existing comments on the post. |

## Method 3 : Save Favorite Post

### Screen Detail

**Page 1**: Recipe post with a favorite / save icon.

[Screenshot: Recipe post showing favorite icon in active and inactive state]

### User Step

1. Open or locate a **recipe post**.
2. Click the **Favorite** icon.
3. Review the icon changed to the saved state.
4. Navigate to **Profile > Saved recipes** to confirm the post is saved.

### Acceptance Criteria

1. System display a Favorite icon on each recipe post.
2. When click Favorite, System save the post to the user's saved recipes and change the icon to the active state.
3. When click Favorite again, System remove the post from saved recipes and change the icon to the inactive state.
4. System display saved posts under the user's Profile saved recipes list.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| post-favorite-icon | Button | favorite-active | Favorite | Button, Clickable | No | Saves or unsaves the recipe to the user's favorites. |

## Method 4 : Create New Recipe

### Screen Detail

**Page 1**: Home menu with a Create Recipe entry button.

[Screenshot: Home menu showing the Create Recipe button]

### User Step

1. Review the **Home** menu.
2. Click **Create Recipe**.
3. Review the recipe creation form displayed.

### Acceptance Criteria

1. System display a Create Recipe button on the Home menu.
2. When click Create Recipe, System navigate the user to the recipe creation form.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| home-create-recipe-btn | Button | btn-active | Create Recipe | Button, Clickable | No | Navigates the user to the create-recipe form. |

## Method 5 : Search Recipe

### Screen Detail

**Page 1**: Home menu with a keyword search bar and an advanced search entry.

[Screenshot: Home menu search bar with advanced search link]

**Page 2**: Search box focused, showing the recent search keyword list with a remove button on each keyword and a clear search button.

[Screenshot: Search box focused with recent keyword list, remove icons, and clear button]

### User Step

1. Review the **Home** menu.
2. Click the **Search** bar.
3. Review the **recent search keyword** list displayed.
4. Optionally click the **Remove** icon next to a recent keyword to delete it.
5. Enter a keyword.
6. Optionally click the **Clear Search** button to clear the entered keyword.
7. Press Enter or click **Search**.
8. Review the search results list.
9. To narrow results, click **Advanced Search**.

### Acceptance Criteria

1. System display a keyword search bar on the Home menu.
2. When click the search box, System display the user's recent search keywords.
3. System display a Remove button next to each recent search keyword.
4. When click Remove, System delete that keyword from the recent search list.
5. System display a Clear Search button that clears the currently entered keyword from the search box.
6. When enter a keyword and click Search, System display recipes matching the keyword.
7. When no result matches, System display a no-result message.
8. System display an Advanced Search entry that navigates the user to filter by ingredient, cooking time, equipment, skill level, and category.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| home-search-input | Text | input-active | Search | Autocomplete text | No | Captures the keyword used to search recipes. |
| home-search-clear-btn | Button | btn-active | Clear Search | Button, Clickable | No | Clears the currently entered keyword from the search box. |
| home-search-btn | Button | btn-active | Search | Button, Clickable | No | Executes the keyword search. |
| home-recent-keyword-list | Box | | Recent Search | Text | | Displays the user's recent search keywords when the search box is focused. |
| home-recent-keyword-remove | Button | remove-active | Remove | Button, Clickable | No | Deletes a keyword from the recent search list. |
| home-advanced-search-link | Text | link-active | Advanced Search | Button, Clickable | No | Navigates the user to the advanced search filters. |
