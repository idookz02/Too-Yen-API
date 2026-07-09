# Advanced Search

## Description

Web Application

Overview

This feature allow User to filter recipes by ingredient, cooking time, equipment, skill level, and category so that recipes can be found from the ingredients the user already has.
So that user able to narrow the recipe feed to matches that fit their available ingredients and cooking constraints.

## Precondition

1. User connect internet / open Too-Yen web application.
2. User login by Too-Yen account.
3. Admin master data for skill level, cooking time, cooking method, category, and equipment must be available to populate the filter options.
4. At least one published recipe must exist for results to be returned; otherwise System display a no-result message.

## Method 1 : Filter Recipe by Advanced Search

### Screen Detail

**Page 1**: Home menu with a keyword search bar and an Advanced Search entry.

[Screenshot: Home menu search bar with Advanced Search link]

**Page 2**: Advanced Search panel showing filter controls for ingredient, cooking time, equipment, skill level, and category, with Apply and Clear buttons.

[Screenshot: Advanced Search filter panel with all filter fields]

**Page 3**: Search results list filtered by the selected criteria.

[Screenshot: Filtered recipe results list]

### User Step

1. Review the **Home** menu.
2. Click **Advanced Search**.
3. Review the **Advanced Search** filter panel displayed.
4. Add one or more **Ingredient** values.
5. Select **Cooking Time**.
6. Select **Equipment**.
7. Select **Skill Level**.
8. Select **Category**.
9. Click **Apply**.
10. Review the filtered search results list.
11. Optionally click **Clear** to reset all filters.

### Acceptance Criteria

1. When click Advanced Search, System display the Advanced Search filter panel.
2. System populate the Cooking Time, Equipment, Skill Level, and Category options from Admin master data.
3. System allow user to add one or more ingredients as filter criteria.
4. System allow user to select multiple filters together and combine them with AND logic.
5. When click Apply, System display recipes that match all selected filter criteria.
6. When no recipe matches, System display a no-result message.
7. When click Clear, System reset all filter selections to the default empty state.
8. System display the applied filters as chips / tags above the results so the user can see the active criteria.
9. System allow user to remove an individual applied filter and refresh the results.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| advanced-search-panel | Box | | Advanced Search Panel | Text | | Container that holds all advanced search filter controls. |
| advanced-filter-ingredient | Text | input-active | Ingredient | Autocomplete text | No | Captures one or more ingredients to filter recipes by. |
| advanced-filter-cooking-time | Box | select-active | Cooking Time | Button, Clickable | No | Selects a cooking-time value from master data. |
| advanced-filter-equipment | Box | select-active | Equipment | Button, Clickable | No | Selects cooking equipment from master data. |
| advanced-filter-skill-level | Box | select-active | Skill Level | Button, Clickable | No | Selects a skill level from master data. |
| advanced-filter-category | Box | select-active | Category | Button, Clickable | No | Selects a recipe category from master data. |
| advanced-apply-btn | Button | btn-active | Apply | Button, Clickable | No | Runs the search with the selected filters. |
| advanced-clear-btn | Button | btn-active | Clear | Button, Clickable | No | Resets all filter selections to the default state. |
| advanced-filter-chip | Box | filter-chip-active | Applied Filter | Button, Clickable | No | Displays an active filter and removes it when clicked. |
| advanced-results-list | Box | | Search Results | Text | | Displays the recipes matching the applied filters. |
