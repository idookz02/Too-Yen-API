import { Elysia } from "elysia";
import { jwtPlugin, resetJwtPlugin } from "../../shared/plugins/auth.plugin";
import { rateLimit } from "../../shared/plugins/rate-limit.plugin";
import { authService } from "./services/auth.service";
import {
  AuthResponseDTO,
  ForgotPasswordCheckDTO,
  LoginDTO,
  ResetPasswordDTO,
  ResetTokenResponseDTO,
  SignupDTO,
} from "./dto/auth.dto";

/** Module 1 — Auth (doc/api/01-auth.md). No token required on these routes. */
export const authController = new Elysia({ prefix: "/auth" })
  // Step 9 hardening: brute-force protection on credential endpoints
  .use(
    rateLimit({ name: "auth", max: Number(process.env.RATE_LIMIT_AUTH_MAX ?? 10) }),
  )
  .use(jwtPlugin)
  .use(resetJwtPlugin)

  // POST /auth/signup — 201 (multipart, optional profile picture)
  .post(
    "/signup",
    async ({ body, jwt, set }) => {
      set.status = 201;
      return authService.signup(body, jwt.sign);
    },
    {
      body: SignupDTO,
      response: { 201: AuthResponseDTO },
      detail: {
        tags: ["Auth"],
        summary: "Sign up",
        description:
          "Create an account (multipart/form-data, optional profile_picture → avatars bucket). " +
          "The DB trigger assigns the starting tier (ADR-012). " +
          "409 DUPLICATE_ACCOUNT when email or username already exists.",
      },
    },
  )

  // POST /auth/login — 200
  .post("/login", ({ body, jwt }) => authService.login(body, jwt.sign), {
    body: LoginDTO,
    response: { 200: AuthResponseDTO },
    detail: {
      tags: ["Auth"],
      summary: "Log in",
      description: "401 INVALID_CREDENTIALS on wrong username/password.",
    },
  })

  // POST /auth/forgot-password/check — 200 { reset_token }
  .post(
    "/forgot-password/check",
    ({ body, resetJwt }) => authService.forgotPasswordCheck(body, resetJwt.sign),
    {
      body: ForgotPasswordCheckDTO,
      response: { 200: ResetTokenResponseDTO },
      detail: {
        tags: ["Auth"],
        summary: "Forgot password — verify account",
        description:
          "Issues a 10-minute reset token. [Amended 2026-07-10] `identifier` must be the " +
          "account email — a username alone is rejected (404 ACCOUNT_NOT_FOUND).",
      },
    },
  )

  // POST /auth/forgot-password/reset — 204
  .post(
    "/forgot-password/reset",
    async ({ body, resetJwt, set }) => {
      await authService.resetPassword(body, resetJwt.verify);
      set.status = 204;
    },
    {
      body: ResetPasswordDTO,
      detail: {
        tags: ["Auth"],
        summary: "Forgot password — set a new password",
        description:
          "400 PASSWORD_MISMATCH when confirm differs; 401 INVALID_RESET_TOKEN on bad/expired token.",
      },
    },
  );
