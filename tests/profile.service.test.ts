/**
 * ProfileService unit tests with mock repositories (decision 2026-07-10).
 */
import { beforeEach, describe, expect, it } from "bun:test";
import { ProfileService } from "../src/modules/profile/services/profile.service";
import { AppError } from "../src/shared/utils/errors";
import { verifyPassword } from "../src/shared/utils/password";
import type { MeRow } from "../src/modules/profile/repositories/profile.repository";
import type { CardRow } from "../src/modules/recipes/repositories/recipes.repository";

const makeMe = (over: Partial<MeRow["user"]> = {}): MeRow => ({
  user: {
    userId: 1,
    email: "a@b.com",
    username: "sakkarin",
    passwordHash: "old-hash",
    displayName: "Sak",
    profilePicturePath: null,
    role: "user",
    createdAt: new Date("2026-07-09T08:00:00Z"),
    tierId: 2,
    ...over,
  },
  tier: { tierId: 2, name: "Silver", minLikes: 100 },
  totalLikesReceived: 152,
});

const cardRow = (over: Partial<CardRow> = {}): CardRow => ({
  recipeId: 1,
  recipeName: "Tom Yum",
  status: "published",
  publishedAt: new Date("2026-07-09T08:00:00Z"),
  authorId: 1,
  authorName: "Sak",
  tierName: "Silver",
  coverPath: "1/cover.jpg",
  likeCount: 5,
  favoriteCount: 2,
  commentCount: 1,
  likedByMe: false,
  favoritedByMe: true,
  ...over,
});

type State = {
  me: MeRow;
  profilePatches: Record<string, unknown>[];
  avatarPaths: string[];
  removed: { bucket: string; paths: string[] }[];
  listCalls: { statuses?: string[]; orderBy?: string }[];
  savedRows: CardRow[];
  ownRows: CardRow[];
};

let state: State;
let service: ProfileService;

beforeEach(() => {
  state = {
    me: makeMe(),
    profilePatches: [],
    avatarPaths: [],
    removed: [],
    listCalls: [],
    savedRows: [],
    ownRows: [],
  };
  service = new ProfileService({
    repo: {
      findMe: async () => state.me,
      updateProfile: async (_id, patch) => {
        state.profilePatches.push(patch);
        if (patch.displayName) state.me.user.displayName = patch.displayName;
        if (patch.passwordHash) state.me.user.passwordHash = patch.passwordHash;
      },
      updateAvatarPath: async (_id, path) => {
        state.avatarPaths.push(path);
        state.me.user.profilePicturePath = path;
      },
    },
    recipesRepo: {
      listFavoritedCards: async () => state.savedRows,
      countFavorited: async () => state.savedRows.length,
      listOwnCards: async (_id, statuses, orderBy) => {
        state.listCalls.push({ statuses, orderBy });
        return state.ownRows;
      },
      countOwn: async () => state.ownRows.length,
    },
    storage: {
      upload: async (_b: string, path: string) => path,
      remove: async (bucket: string, paths: string[]) => {
        if (paths.length > 0) state.removed.push({ bucket, paths });
      },
      publicUrl: (bucket: string, path: string) => `https://cdn.test/${bucket}/${path}`,
    } as never,
  });
});

const user = { userId: 1, role: "user" };

const expectAppError = async (fn: () => Promise<unknown>, status: number, code: string) => {
  try {
    await fn();
    throw new Error(`expected AppError ${code}`);
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(status);
    expect((e as AppError).code).toBe(code);
  }
};

describe("me", () => {
  it("maps tier (with min_likes) + total_likes_received", async () => {
    const res = await service.me(user);
    expect(res).toMatchObject({
      user_id: 1,
      username: "sakkarin",
      tier: { tier_id: 2, name: "Silver", min_likes: 100 },
      total_likes_received: 152,
      profile_picture_url: null,
      created_at: "2026-07-09T08:00:00.000Z",
    });
  });
});

describe("update", () => {
  it("400 PASSWORD_POLICY_VIOLATION for a short password", async () => {
    await expectAppError(
      () => service.update({ password: "short" }, user),
      400,
      "PASSWORD_POLICY_VIOLATION",
    );
    expect(state.profilePatches).toHaveLength(0);
  });

  it("hashes the new password (never stores plaintext)", async () => {
    await service.update({ password: "new-secret-1" }, user);
    const stored = state.profilePatches[0]!.passwordHash as string;
    expect(stored).not.toBe("new-secret-1");
    expect(await verifyPassword("new-secret-1", stored)).toBe(true);
  });

  it("updates display_name and returns the fresh profile", async () => {
    const res = await service.update({ display_name: "Sak V2" }, user);
    expect(res.display_name).toBe("Sak V2");
  });

  it("empty patch is a no-op", async () => {
    await service.update({}, user);
    expect(state.profilePatches).toHaveLength(0);
  });
});

describe("updateAvatar", () => {
  const file = () => new File(["x"], "me.png", { type: "image/png" });

  it("uploads the new picture and returns its URL", async () => {
    const res = await service.updateAvatar(file(), user);
    expect(res.profile_picture_url).toContain("https://cdn.test/avatars/1/");
    expect(state.removed).toHaveLength(0); // no old file existed
  });

  it("deletes the previous file after replacing", async () => {
    state.me = makeMe({ profilePicturePath: "1/old.png" });
    await service.updateAvatar(file(), user);
    expect(state.removed).toEqual([{ bucket: "avatars", paths: ["1/old.png"] }]);
  });
});

describe("lists", () => {
  it("savedRecipes wraps cards in the pagination envelope", async () => {
    state.savedRows = [cardRow({ authorId: 2, authorName: "Aor" })];
    const res = await service.savedRecipes({}, user);
    expect(res.data[0]).toMatchObject({
      recipe_id: 1,
      is_owner: false,
      favorited_by_me: true,
      cover_image_url: "https://cdn.test/recipe-media/1/cover.jpg",
    });
    expect(res.pagination.total).toBe(1);
  });

  it("drafts queries status=draft ordered by last edit", async () => {
    await service.drafts({}, user);
    expect(state.listCalls[0]).toEqual({ statuses: ["draft"], orderBy: "updated" });
  });

  it("ownRecipes defaults to published + private", async () => {
    await service.ownRecipes({}, user);
    expect(state.listCalls[0]).toEqual({
      statuses: ["published", "private"],
      orderBy: "published",
    });
  });

  it("ownRecipes respects an explicit status filter", async () => {
    await service.ownRecipes({ status: "private" }, user);
    expect(state.listCalls[0]!.statuses).toEqual(["private"]);
  });
});
