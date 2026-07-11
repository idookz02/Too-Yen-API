# Module 1: Auth

References: sign-up-login-forgot-password.md | No token required

## POST /auth/signup

Create a new account — multipart (optional picture)

Request (`multipart/form-data`): `email`*, `username`*, `password`*, `display_name`*, `profile_picture` (file, optional)

Response `201`:

```json
{
  "user": { "user_id": 1, "username": "sakkarin", "display_name": "Sak", "email": "a@b.com",
            "profile_picture_url": null, "role": "user", "tier": { "tier_id": 1, "name": "Bronze" } },
  "access_token": "eyJ..."
}
```

Errors: `400 VALIDATION_ERROR` (missing/invalid fields), `409 DUPLICATE_ACCOUNT` (email or username already exists — AC 4)

## POST /auth/login

```json
{ "username": "sakkarin", "password": "secret" }
```

Response `200`: same shape as signup (user + access_token)
Errors: `401 INVALID_CREDENTIALS` (AC 4 — stay on the login page)

## POST /auth/forgot-password/check

Verify the account exists (AC 2) — accepts email or username
> **[Amended 2026-07-10]** `identifier` must be the account **email** — a username alone no longer issues a reset token. Rationale: the in-app reset has no email-verification step, so anyone knowing a public username could take over the account; requiring the full email raises the bar. A username-only identifier returns `404 ACCOUNT_NOT_FOUND`.

```json
{ "identifier": "a@b.com" }
```

Response `200`: `{ "reset_token": "opaque-short-lived-token" }`
Errors: `404 ACCOUNT_NOT_FOUND` (AC 3)

## POST /auth/forgot-password/reset

```json
{ "reset_token": "...", "new_password": "...", "confirm_password": "..." }
```

Response `204` → frontend redirects to the Login page (AC 6)
Errors: `400 PASSWORD_MISMATCH` (AC 5), `401 INVALID_RESET_TOKEN`

> Note: the original spec defines an in-app reset with no email step — `reset_token` is short-lived (e.g. 10 minutes) to prevent calling reset directly without passing check.

> **Implementation decisions (2026-07-10):** `access_token` is a JWT with `sub` = user_id and a `role` claim, TTL **24h** (env `JWT_EXPIRES_IN`); no refresh endpoint. `reset_token` is a stateless **10-minute JWT** carrying a `purpose: password_reset` claim (an access token cannot be replayed as a reset token); it is not single-use — acceptable within the 10-minute window for this project.
