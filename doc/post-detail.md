# Post Detail

## Description

Web Application

Overview

This feature allow User to view the full detail of a shared recipe post — including recipe information, ingredients, cooking steps, and video — and to engage with it through like, favorite, and comment.
So that user able to follow a recipe end-to-end and interact with the community.

## Precondition

1. User connect internet / open Too-Yen web application.
2. User login by Too-Yen account.
3. The recipe post must be published; draft recipes are not accessible from the post detail page.
4. User reach the post detail page from the Home feed, search results, or saved recipes list.

## Method 1 : View Post Detail

### Screen Detail

**Page 1**: Home feed or search results list showing recipe post cards.

[Screenshot: Feed / results list with recipe post cards]

**Page 2**: Post detail page showing recipe header (name, author, picture), recipe attributes, ingredients, cooking steps, video, and the engagement bar.

[Screenshot: Full recipe post detail page with all sections]

### User Step

1. Review the **Home** feed or search results.
2. Click an individual **recipe post**.
3. Review the recipe **header**: name, author, and picture.
4. Review the recipe **attributes**: skill level, cooking method, cooking time, category, and equipment.
5. Review the **Ingredient** list.
6. Review the **Cooking Steps**.
7. Play the **Video**.
8. Review the **engagement bar**: like count, favorite, and comment.

### Acceptance Criteria

1. When click a recipe post, System open the post detail page.
2. System display the recipe header with recipe name, author display name, and recipe picture.
3. System display the recipe attributes: skill level, cooking method, cooking time, category, and equipment.
4. System display the ingredient list in the order entered by the recipe owner.
5. System display the cooking steps in sequential step order.
6. When a video is attached, System display and allow playback of the video; when no video exists, System hide the video section.
7. System display the total like count and total favorite count on the post.
8. System display the post detail page as read-only for users who are not the recipe owner.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| post-detail-root | Box | | Post Detail | Text | | Container for the full recipe post detail page. |
| post-detail-title | Text | | Recipe Name | Text | | Displays the recipe name. |
| post-detail-author | Text | | Author | Text | | Displays the display name of the recipe owner. |
| post-detail-picture | Box | | Recipe Picture | Text | | Displays the recipe cover image. |
| post-detail-skill-level | Text | | Skill Level | Text | | Displays the recipe skill level. |
| post-detail-cooking-method | Text | | Cooking Method | Text | | Displays the cooking method. |
| post-detail-cooking-time | Text | | Cooking Time | Text | | Displays the cooking time. |
| post-detail-category | Text | | Category | Text | | Displays the recipe category. |
| post-detail-equipment | Text | | Equipment | Text | | Displays the cooking equipment used. |
| post-detail-ingredient-list | Box | | Ingredient | Text | | Displays the list of ingredients. |
| post-detail-step-list | Box | | Cooking Steps | Text | | Displays the sequential cooking steps. |
| post-detail-video | Box | video-active | Video | Button, Clickable | No | Plays the attached recipe video. |
| post-detail-like-icon | Button | like-active | Like | Button, Clickable | No | Likes or unlikes the post and updates the like count. |
| post-detail-favorite-icon | Button | favorite-active | Favorite | Button, Clickable | No | Saves or unsaves the post to the user's favorites. |
| post-detail-comment-input | Text | input-active | Comment | Text | No | Captures a comment on the post. |
| post-detail-comment-send-btn | Button | btn-active | Send | Button, Clickable | No | Submits the comment to the post. |
| post-detail-comment-list | Box | | Comment List | Text | | Displays existing comments, latest first. |
