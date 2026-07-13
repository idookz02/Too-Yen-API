/**
 * AuthService unit tests with a mock repository/storage (decision 2026-07-10:
 * DB-touching logic is unit-tested against mocks; real-DB integration lives in
 * the Step-9 smoke script).
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { AuthService } from "../src/modules/auth/services/auth.service";
import { AppError } from "../src/shared/utils/errors";
import { hashPassword } from "../src/shared/utils/password";
import { RESET_TOKEN_PURPOSE } from "../src/shared/plugins/auth.plugin";
import type { UserRow } from "../src/modules/auth/repositories/auth.repository";

const BASE_USER: UserRow = {
  userId: 1,
  email: "a@b.com",
  username: "sakkarin",
  passwordHash: "",
  displayName: "Sak",
  profilePicturePath: null,
  role: "user",
  createdAt: new Date("2026-07-10T00:00:00Z"),
  updatedAt: new Date("2026-07-10T00:00:00Z"),
  tierId: 1,
};

function makeMockRepo(overrides: Partial<Record<string, unknown>> = {}) {
  const state = {
    users: [] as UserRow[],
    updatedPasswords: [] as { userId: number; hash: string }[],
  };
  const repo = {
    findByEmail: async (email: string) =>
      state.users.find((u) => u.email === email) ?? null,
    findByUsername: async (username: string) =>
      state.users.find((u) => u.username === username) ?? null,
    insertUser: async (input: Partial<UserRow>) => {
      const row: UserRow = {
        ...BASE_USER,
        ...input,
        userId: state.users.length + 1,
      } as UserRow;
      state.users.push(row);
      return row;
    },
    findWithTier: async (userId: number) => {
      const u = state.users.find((x) => x.userId === userId);
      if (!u) return null;
      return { ...u, tier: { tierId: 1, name: "Bronze" } };
    },
    updatePassword: async (userId: number, hash: string) => {
      state.updatedPasswords.push({ userId, hash });
    },
    updateProfilePicturePath: async () => {},
    ...overrides,
  };
  return { repo, state };
}

const mockStorage = {
  upload: async (_b: string, path: string) => path,
  publicUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
};

const signAccess = async (p: { sub: string; role: string }) =>
  `access:${p.sub}:${p.role}`;
const signReset = async (p: { sub: string; purpose: string }) =>
  `reset:${p.sub}:${p.purpose}`;

const expectAppError = async (
  fn: () => Promise<unknown>,
  status: number,
  code: string,
) => {
  try {
    await fn();
    throw new Error(`expected AppError ${code}, nothing thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(status);
    expect((e as AppError).code).toBe(code);
  }
};

describe("AuthService.signup", () => {
  let service: AuthService;
  let state: ReturnType<typeof makeMockRepo>["state"];

  beforeEach(() => {
    const m = makeMockRepo();
    state = m.state;
    service = new AuthService({ repo: m.repo as never, storage: mockStorage });
  });

  it("creates the user, returns tier from re-read + access token", async () => {
    const res = await service.signup(
      {
        email: "a@b.com",
        username: "sakkarin",
        password: "secret-123",
        display_name: "Sak",
      },
      signAccess,
    );
    expect(res.user).toMatchObject({
      user_id: 1,
      username: "sakkarin",
      email: "a@b.com",
      role: "user",
      profile_picture_url: null,
      tier: { tier_id: 1, name: "Bronze" },
    });
    expect(res.access_token).toBe("access:1:user");
    // password is stored hashed, not plaintext
    expect(state.users[0]!.passwordHash).not.toBe("secret-123");
  });

  it("409 DUPLICATE_ACCOUNT on duplicate email", async () => {
    await service.signup(
      { email: "a@b.com", username: "one", password: "secret-123", display_name: "x" },
      signAccess,
    );
    await expectAppError(
      () =>
        service.signup(
          { email: "a@b.com", username: "two", password: "secret-123", display_name: "y" },
          signAccess,
        ),
      409,
      "DUPLICATE_ACCOUNT",
    );
  });

  it("409 DUPLICATE_ACCOUNT on duplicate username", async () => {
    await service.signup(
      { email: "a@b.com", username: "same", password: "secret-123", display_name: "x" },
      signAccess,
    );
    await expectAppError(
      () =>
        service.signup(
          { email: "c@d.com", username: "same", password: "secret-123", display_name: "y" },
          signAccess,
        ),
      409,
      "DUPLICATE_ACCOUNT",
    );
  });
});

describe("AuthService.login", () => {
  it("returns user + token on correct credentials", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    m.state.users.push({
      ...BASE_USER,
      passwordHash: await hashPassword("secret-123"),
    });

    const res = await service.login(
      { username: "sakkarin", password: "secret-123" },
      signAccess,
    );
    expect(res.user.user_id).toBe(1);
    expect(res.access_token).toBe("access:1:user");
  });

  it("401 INVALID_CREDENTIALS on unknown username", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    await expectAppError(
      () => service.login({ username: "ghost", password: "whatever-1" }, signAccess),
      401,
      "INVALID_CREDENTIALS",
    );
  });

  it("401 INVALID_CREDENTIALS on wrong password", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    m.state.users.push({
      ...BASE_USER,
      passwordHash: await hashPassword("correct-pw-1"),
    });
    await expectAppError(
      () => service.login({ username: "sakkarin", password: "wrong-pw-1" }, signAccess),
      401,
      "INVALID_CREDENTIALS",
    );
  });
});

describe("AuthService.forgotPasswordCheck", () => {
  it("issues a reset token for a known email", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    m.state.users.push({ ...BASE_USER });

    const res = await service.forgotPasswordCheck({ identifier: "a@b.com" }, signReset);
    expect(res.reset_token).toBe(`reset:1:${RESET_TOKEN_PURPOSE}`);
  });

  it("404 ACCOUNT_NOT_FOUND for a username (email required — 2026-07-10 hardening)", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    m.state.users.push({ ...BASE_USER });

    await expectAppError(
      () => service.forgotPasswordCheck({ identifier: "sakkarin" }, signReset),
      404,
      "ACCOUNT_NOT_FOUND",
    );
  });
});

describe("AuthService.resetPassword", () => {
  const validVerify = async () => ({ sub: "1", purpose: RESET_TOKEN_PURPOSE });

  it("400 PASSWORD_MISMATCH when confirm differs", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    await expectAppError(
      () =>
        service.resetPassword(
          { reset_token: "t", new_password: "new-pass-1", confirm_password: "new-pass-2" },
          validVerify,
        ),
      400,
      "PASSWORD_MISMATCH",
    );
  });

  it("401 INVALID_RESET_TOKEN on expired/garbage token", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    await expectAppError(
      () =>
        service.resetPassword(
          { reset_token: "bad", new_password: "new-pass-1", confirm_password: "new-pass-1" },
          async () => false,
        ),
      401,
      "INVALID_RESET_TOKEN",
    );
  });

  it("401 INVALID_RESET_TOKEN when an ACCESS token is replayed as a reset token", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    await expectAppError(
      () =>
        service.resetPassword(
          { reset_token: "t", new_password: "new-pass-1", confirm_password: "new-pass-1" },
          async () => ({ sub: "1", role: "user" }), // no purpose claim
        ),
      401,
      "INVALID_RESET_TOKEN",
    );
  });

  it("updates the password hash on a valid token", async () => {
    const m = makeMockRepo();
    const service = new AuthService({ repo: m.repo as never, storage: mockStorage });
    await service.resetPassword(
      { reset_token: "t", new_password: "new-pass-1", confirm_password: "new-pass-1" },
      validVerify,
    );
    expect(m.state.updatedPasswords).toHaveLength(1);
    expect(m.state.updatedPasswords[0]!.userId).toBe(1);
    expect(m.state.updatedPasswords[0]!.hash).not.toBe("new-pass-1");
  });
});
