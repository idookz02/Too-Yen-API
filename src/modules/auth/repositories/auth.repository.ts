import { eq } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import { masterTier, users } from "../../../db/schema";

export type UserRow = typeof users.$inferSelect;
export type UserWithTier = UserRow & {
  tier: { tierId: number; name: string } | null;
};

export class AuthRepository {
  async findByEmail(email: string, executor: Executor = db) {
    const [u] = await executor
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return u ?? null;
  }

  async findByUsername(username: string, executor: Executor = db) {
    const [u] = await executor
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return u ?? null;
  }

  async insertUser(
    input: typeof users.$inferInsert,
    executor: Executor = db,
  ): Promise<UserRow> {
    const [created] = await executor.insert(users).values(input).returning();
    if (!created) throw new Error("insertUser returned no row");
    return created;
  }

  /** Re-read a user with the tier the DB trigger assigned (ADR-012). */
  async findWithTier(
    userId: number,
    executor: Executor = db,
  ): Promise<UserWithTier | null> {
    const [row] = await executor
      .select({
        user: users,
        tierId: masterTier.tierId,
        tierName: masterTier.name,
      })
      .from(users)
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(eq(users.userId, userId))
      .limit(1);
    if (!row) return null;
    return {
      ...row.user,
      tier:
        row.tierId != null && row.tierName != null
          ? { tierId: row.tierId, name: row.tierName }
          : null,
    };
  }

  async updatePassword(
    userId: number,
    passwordHash: string,
    executor: Executor = db,
  ) {
    await executor
      .update(users)
      .set({ passwordHash })
      .where(eq(users.userId, userId));
  }

  async updateProfilePicturePath(
    userId: number,
    profilePicturePath: string,
    executor: Executor = db,
  ) {
    await executor
      .update(users)
      .set({ profilePicturePath })
      .where(eq(users.userId, userId));
  }
}

export const authRepository = new AuthRepository();
