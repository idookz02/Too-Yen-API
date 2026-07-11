import {
  authRepository,
  type AuthRepository,
  type UserWithTier,
} from "../repositories/auth.repository";
import {
  BUCKETS,
  buildObjectPath,
  storageService,
  type StorageService,
} from "../../../shared/services/storage.service";
import { hashPassword, verifyPassword } from "../../../shared/utils/password";
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from "../../../shared/utils/errors";
import {
  RESET_TOKEN_PURPOSE,
  type JwtPayload,
  type ResetJwtPayload,
} from "../../../shared/plugins/auth.plugin";
import type {
  ForgotPasswordCheckInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
} from "../dto/auth.dto";

type AccessSigner = (payload: JwtPayload) => Promise<string>;
type ResetSigner = (payload: ResetJwtPayload) => Promise<string>;
/** @elysiajs/jwt verify: payload object or false when invalid/expired */
type ResetVerifier = (token: string) => Promise<Record<string, unknown> | false>;

/** Injectable deps so tests can swap the DB/storage for mocks. */
export type AuthServiceDeps = {
  repo?: Pick<
    AuthRepository,
    | "findByEmail"
    | "findByUsername"
    | "insertUser"
    | "findWithTier"
    | "updatePassword"
    | "updateProfilePicturePath"
  >;
  storage?: Pick<StorageService, "upload" | "publicUrl">;
};

export class AuthService {
  private readonly repo: NonNullable<AuthServiceDeps["repo"]>;
  private readonly storage: NonNullable<AuthServiceDeps["storage"]>;

  constructor(deps: AuthServiceDeps = {}) {
    this.repo = deps.repo ?? authRepository;
    this.storage = deps.storage ?? storageService;
  }

  // POST /auth/signup
  async signup(input: SignupInput, sign: AccessSigner) {
    if (await this.repo.findByEmail(input.email)) {
      throw conflict("Email already exists", "DUPLICATE_ACCOUNT");
    }
    if (await this.repo.findByUsername(input.username)) {
      throw conflict("Username already exists", "DUPLICATE_ACCOUNT");
    }

    const created = await this.repo.insertUser({
      email: input.email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      displayName: input.display_name,
    });

    if (input.profile_picture) {
      const path = buildObjectPath(created.userId, input.profile_picture);
      await this.storage.upload(BUCKETS.avatars, path, input.profile_picture);
      await this.repo.updateProfilePicturePath(created.userId, path);
    }

    // re-read: DB trigger assigns the base tier on insert (ADR-012)
    const user = await this.repo.findWithTier(created.userId);
    if (!user) throw new Error(`signup: user ${created.userId} vanished after insert`);
    return this.buildAuthResponse(user, sign);
  }

  // POST /auth/login
  async login(input: LoginInput, sign: AccessSigner) {
    const u = await this.repo.findByUsername(input.username);
    if (!u) throw unauthorized("Invalid username or password", "INVALID_CREDENTIALS");
    const ok = await verifyPassword(input.password, u.passwordHash);
    if (!ok) throw unauthorized("Invalid username or password", "INVALID_CREDENTIALS");

    const user = await this.repo.findWithTier(u.userId);
    if (!user) throw unauthorized("Invalid username or password", "INVALID_CREDENTIALS");
    return this.buildAuthResponse(user, sign);
  }

  /**
   * POST /auth/forgot-password/check
   * [Amended 2026-07-10] Requires the account EMAIL; a username alone is not
   * accepted (in-app reset has no email verification step — requiring the full
   * email raises the bar against account takeover). See doc/api/01-auth.md.
   */
  async forgotPasswordCheck(input: ForgotPasswordCheckInput, sign: ResetSigner) {
    const u = await this.repo.findByEmail(input.identifier);
    if (!u) throw notFound("Account not found", "ACCOUNT_NOT_FOUND");
    const reset_token = await sign({
      sub: String(u.userId),
      purpose: RESET_TOKEN_PURPOSE,
    });
    return { reset_token };
  }

  // POST /auth/forgot-password/reset -> 204
  async resetPassword(input: ResetPasswordInput, verify: ResetVerifier) {
    if (input.new_password !== input.confirm_password) {
      throw badRequest("Passwords do not match", "PASSWORD_MISMATCH");
    }
    const payload = await verify(input.reset_token);
    if (
      !payload ||
      payload.purpose !== RESET_TOKEN_PURPOSE ||
      typeof payload.sub !== "string"
    ) {
      throw unauthorized("Invalid or expired reset token", "INVALID_RESET_TOKEN");
    }
    await this.repo.updatePassword(
      Number(payload.sub),
      await hashPassword(input.new_password),
    );
  }

  private async buildAuthResponse(user: UserWithTier, sign: AccessSigner) {
    const access_token = await sign({ sub: String(user.userId), role: user.role });
    return {
      user: {
        user_id: user.userId,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        profile_picture_url: user.profilePicturePath
          ? this.storage.publicUrl(BUCKETS.avatars, user.profilePicturePath)
          : null,
        role: user.role,
        tier: user.tier ? { tier_id: user.tier.tierId, name: user.tier.name } : null,
      },
      access_token,
    };
  }
}

export const authService = new AuthService();
