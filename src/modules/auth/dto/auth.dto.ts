import { t } from "elysia";

// ============================================================================
// Request DTOs (doc/api/01-auth.md)
// ============================================================================

/** POST /auth/signup — multipart/form-data */
export const SignupDTO = t.Object({
  email: t.String({ format: "email", examples: ["a@b.com"] }),
  username: t.String({ minLength: 3, maxLength: 100, examples: ["sakkarin"] }),
  password: t.String({ minLength: 8 }),
  display_name: t.String({ minLength: 1, maxLength: 100, examples: ["Sak"] }),
  profile_picture: t.Optional(t.File({ type: "image" })),
});
export type SignupInput = typeof SignupDTO.static;

export const LoginDTO = t.Object({
  username: t.String({ minLength: 1, examples: ["sakkarin"] }),
  password: t.String({ minLength: 1 }),
});
export type LoginInput = typeof LoginDTO.static;

/**
 * POST /auth/forgot-password/check
 * [Amended 2026-07-10] identifier must be the account EMAIL — username alone
 * no longer issues a reset token (see the note in doc/api/01-auth.md).
 */
export const ForgotPasswordCheckDTO = t.Object({
  identifier: t.String({ description: "Account email", examples: ["a@b.com"] }),
});
export type ForgotPasswordCheckInput = typeof ForgotPasswordCheckDTO.static;

export const ResetPasswordDTO = t.Object({
  reset_token: t.String(),
  new_password: t.String({ minLength: 8 }),
  confirm_password: t.String({ minLength: 8 }),
});
export type ResetPasswordInput = typeof ResetPasswordDTO.static;

// ============================================================================
// Response DTOs
// ============================================================================

export const AuthUserDTO = t.Object({
  user_id: t.Number({ examples: [1] }),
  username: t.String({ examples: ["sakkarin"] }),
  display_name: t.String({ examples: ["Sak"] }),
  email: t.String({ format: "email", examples: ["a@b.com"] }),
  profile_picture_url: t.Union([t.String(), t.Null()]),
  role: t.String({ examples: ["user"] }),
  tier: t.Union([
    t.Object({ tier_id: t.Number(), name: t.String({ examples: ["Rookie"] }) }),
    t.Null(),
  ]),
});

/** signup 201 / login 200 share this shape */
export const AuthResponseDTO = t.Object({
  user: AuthUserDTO,
  access_token: t.String(),
});

export const ResetTokenResponseDTO = t.Object({
  reset_token: t.String({ description: "Short-lived (10 min) signed token" }),
});
