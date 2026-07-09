# Sign-up / Login / Forgot Password

## Description

Web Application

Overview

This feature allow User to create a new Too-Yen account, log in with their credentials, and recover access when they forget their password.
So that user able to enter the application and reach the Home menu to share and search recipes.

## Precondition

1. User connect internet / open Too-Yen web application.
2. System default landing page as Login Page.
3. For Sign-up, the email and username must not already be registered in the system.
4. For Login and Forgot Password, the account must already exist in the system.
5. Master data and Home menu must be available so the user can be routed after successful authentication.

## Method 1 : Sign-up (Create new account)

### Screen Detail

**Page 1**: Login Page showing the entry point with a link / button to create a new account.

[Screenshot: Login Page with "Sign-up" call-to-action]

**Page 2**: Sign-up form capturing email, username, password, profile picture, and display name.

[Screenshot: Sign-up form with all input fields and Create Account button]

### User Step

1. Open Too-Yen web application.
2. On the **Login Page**, click **Sign-up**.
3. Enter **Email**.
4. Enter **Username**.
5. Enter **Password**.
6. Upload **Profile Picture**.
7. Enter **Display Name**.
8. Click **Create Account**.
9. Review the **Home** menu displayed as the default page.

### Acceptance Criteria

1. System default landing page as Login Page.
2. When click Sign-up, System display the Sign-up form with Email, Username, Password, Profile Picture, and Display Name fields.
3. System validate Email, Username, and Password as required fields before allowing account creation.
4. When Email or Username already exists, System display a duplicate account message and does not create the account.
5. When click Create Account with valid input, System create the new user account and store the profile picture and display name.
6. When account is created successfully, System redirect user to the Home (default) menu.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| signup-email-input | Text | input-active | Email | Autocomplete text | Yes | Captures the user's email address used for account and password recovery. |
| signup-username-input | Text | input-active | Username | Text | Yes | Captures the unique username used to log in. |
| signup-password-input | Text | input-active | Password | Text (masked) | Yes | Captures the account password, hidden while typing. |
| signup-picture-upload | Box | upload-active | Profile Picture | Button, Clickable | No | Uploads the user's profile picture. |
| signup-displayname-input | Text | input-active | Display Name | Text | Yes | Captures the name shown to the community on posts. |
| signup-create-btn | Button | btn-active | Create Account | Button, Clickable | Yes | Submits the form and creates the new account. |

## Method 2 : Login

### Screen Detail

**Page 1**: Login Page with username and password fields, a Login button, and a Forgot Password link.

[Screenshot: Login Page with credential fields and Login button]

### User Step

1. Open Too-Yen web application.
2. On the **Login Page**, enter **Username**.
3. Enter **Password**.
4. Click **Login**.
5. Review the **Home** menu displayed as the default page.

### Acceptance Criteria

1. System default landing page as Login Page.
2. System require Username and Password before allowing login.
3. When click Login with valid credentials, System validate the user and redirect to the Home (default) menu.
4. When credentials are invalid, System display an error message and keep the user on the Login Page to retry.
5. System display a Forgot Password link on the Login Page.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| login-username-input | Text | input-active | Username | Text | Yes | Captures the username for authentication. |
| login-password-input | Text | input-active | Password | Text (masked) | Yes | Captures the password, hidden while typing. |
| login-submit-btn | Button | btn-active | Login | Button, Clickable | Yes | Validates credentials and signs the user in. |
| login-forgot-link | Text | link-active | Forgot Password | Button, Clickable | No | Navigates the user to the password recovery flow. |

## Method 3 : Forgot Password

### Screen Detail

**Page 1**: Forgot Password page with a field to enter email or username to locate the account.

[Screenshot: Forgot Password page with email / username field]

**Page 2**: Reset Password page with new password and confirm password fields.

[Screenshot: Reset Password page with new password fields]

### User Step

1. On the **Login Page**, click **Forgot Password**.
2. Enter **Email or Username**.
3. Click **Check Account**.
4. Enter **New Password**.
5. Enter **Confirm Password**.
6. Click **Save**.
7. Review the **Login Page** displayed to sign in with the new password.

### Acceptance Criteria

1. When click Forgot Password, System display the account lookup page with an Email or Username field.
2. When click Check Account, System verify whether the account exists.
3. When the account is not found, System display a not-found message and does not proceed to reset.
4. When the account is found, System display the Reset Password page with New Password and Confirm Password fields.
5. System require New Password and Confirm Password to match before saving.
6. When click Save with matching passwords, System update the account password and redirect the user to the Login Page.

### Field Description

| ID | Element | Class (Active State) | Field Name | Field Type | Required | Description |
|----|---------|----------------------|------------|------------|----------|-------------|
| forgot-account-input | Text | input-active | Email or Username | Text | Yes | Captures the email or username used to locate the account. |
| forgot-check-btn | Button | btn-active | Check Account | Button, Clickable | Yes | Verifies whether the account exists. |
| reset-newpassword-input | Text | input-active | New Password | Text (masked) | Yes | Captures the new account password. |
| reset-confirmpassword-input | Text | input-active | Confirm Password | Text (masked) | Yes | Confirms the new password matches. |
| reset-save-btn | Button | btn-active | Save | Button, Clickable | Yes | Saves the new password and returns to Login. |
