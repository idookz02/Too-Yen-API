import { eq, sql } from "drizzle-orm";
import { db, type Executor } from "../../../db";
import { masterTier, recipe, recipeLike, users } from "../../../db/schema";

export type MeRow = {
  user: typeof users.$inferSelect;
  tier: { tierId: number; name: string; minLikes: number } | null;
  totalLikesReceived: number;
};

export class ProfileRepository {
  /** User + tier (with min_likes) + total likes across own recipes (ADR-012). */
  async findMe(userId: number, executor: Executor = db): Promise<MeRow | null> {
    const [row] = await executor
      .select({
        user: users,
        tierId: masterTier.tierId,
        tierName: masterTier.name,
        tierMinLikes: masterTier.minLikes,
        totalLikesReceived:
          sql<number>`(select count(*) from ${recipeLike} rl join ${recipe} r on r.recipe_id = rl.recipe_id where r.user_id = ${userId})`.mapWith(
            Number,
          ),
      })
      .from(users)
      .leftJoin(masterTier, eq(users.tierId, masterTier.tierId))
      .where(eq(users.userId, userId))
      .limit(1);
    if (!row) return null;
    return {
      user: row.user,
      tier:
        row.tierId != null && row.tierName != null && row.tierMinLikes != null
          ? { tierId: row.tierId, name: row.tierName, minLikes: row.tierMinLikes }
          : null,
      totalLikesReceived: row.totalLikesReceived,
    };
  }

  async updateProfile(
    userId: number,
    patch: { displayName?: string; passwordHash?: string },
    executor: Executor = db,
  ): Promise<void> {
    await executor.update(users).set(patch).where(eq(users.userId, userId));
  }

  async updateAvatarPath(
    userId: number,
    profilePicturePath: string,
    executor: Executor = db,
  ): Promise<void> {
    await executor
      .update(users)
      .set({ profilePicturePath })
      .where(eq(users.userId, userId));
  }
}

export const profileRepository = new ProfileRepository();
