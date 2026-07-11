/**
 * Password hashing — Bun.password with argon2id (implementation-plan Phase 1).
 */
export const hashPassword = (plain: string) =>
  Bun.password.hash(plain, { algorithm: "argon2id" });

export const verifyPassword = (plain: string, hash: string) =>
  Bun.password.verify(plain, hash);
