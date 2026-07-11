import {
  profileRepository,
  type MeRow,
  type ProfileRepository,
} from "../repositories/profile.repository";
import {
  recipesRepository,
  type RecipesRepository,
} from "../../recipes/repositories/recipes.repository";
import { mapRecipeCard } from "../../recipes/services/recipe-card";
import {
  BUCKETS,
  buildObjectPath,
  storageService,
  type StorageService,
} from "../../../shared/services/storage.service";
import { hashPassword } from "../../../shared/utils/password";
import { badRequest, notFound } from "../../../shared/utils/errors";
import { paginated, parsePagination } from "../../../shared/utils/pagination";
import type { CurrentUser } from "../../../shared/plugins/auth.plugin";
import type { UpdateMeInput } from "../dto/profile.dto";

const PASSWORD_MIN_LENGTH = 8; // same policy as signup (decision 2026-07-10)

export type ProfileServiceDeps = {
  repo?: Pick<ProfileRepository, "findMe" | "updateProfile" | "updateAvatarPath">;
  recipesRepo?: Pick<
    RecipesRepository,
    "listFavoritedCards" | "countFavorited" | "listOwnCards" | "countOwn"
  >;
  storage?: Pick<StorageService, "upload" | "remove" | "publicUrl">;
};

export class ProfileService {
  private readonly repo: NonNullable<ProfileServiceDeps["repo"]>;
  private readonly recipesRepo: NonNullable<ProfileServiceDeps["recipesRepo"]>;
  private readonly storage: NonNullable<ProfileServiceDeps["storage"]>;

  constructor(deps: ProfileServiceDeps = {}) {
    this.repo = deps.repo ?? profileRepository;
    this.recipesRepo = deps.recipesRepo ?? recipesRepository;
    this.storage = deps.storage ?? storageService;
  }

  // GET /users/me
  async me(user: CurrentUser) {
    const row = await this.repo.findMe(user.userId);
    if (!row) throw notFound("User not found", "USER_NOT_FOUND");
    return this.mapMe(row);
  }

  // PATCH /users/me — display_name / password only (username immutable, AC 6)
  async update(input: UpdateMeInput, user: CurrentUser) {
    const patch: { displayName?: string; passwordHash?: string } = {};
    if (input.display_name !== undefined) patch.displayName = input.display_name;
    if (input.password !== undefined) {
      if (input.password.length < PASSWORD_MIN_LENGTH) {
        throw badRequest(
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
          "PASSWORD_POLICY_VIOLATION",
        );
      }
      patch.passwordHash = await hashPassword(input.password);
    }
    if (Object.keys(patch).length > 0) {
      await this.repo.updateProfile(user.userId, patch);
    }
    return this.me(user);
  }

  // PUT /users/me/avatar — replace picture, delete the old file (ADR-009)
  async updateAvatar(file: File, user: CurrentUser) {
    const current = await this.repo.findMe(user.userId);
    if (!current) throw notFound("User not found", "USER_NOT_FOUND");
    const oldPath = current.user.profilePicturePath; // capture before any mutation

    const path = await this.storage.upload(
      BUCKETS.avatars,
      buildObjectPath(user.userId, file),
      file,
    );
    await this.repo.updateAvatarPath(user.userId, path);
    if (oldPath) await this.storage.remove(BUCKETS.avatars, [oldPath]);
    return { profile_picture_url: this.storage.publicUrl(BUCKETS.avatars, path) };
  }

  // GET /users/me/saved-recipes — favorite order desc (AC 5)
  async savedRecipes(query: { page?: number; limit?: number }, user: CurrentUser) {
    const { page, limit, offset } = parsePagination(query);
    const [rows, total] = await Promise.all([
      this.recipesRepo.listFavoritedCards(user.userId, { limit, offset }),
      this.recipesRepo.countFavorited(user.userId),
    ]);
    return paginated(rows.map((r) => this.mapCard(r, user)), page, limit, total);
  }

  // GET /users/me/drafts — most recently edited first
  async drafts(query: { page?: number; limit?: number }, user: CurrentUser) {
    return this.ownList(query, ["draft"], "updated", user);
  }

  // GET /users/me/recipes?status= — omitted -> published + private
  async ownRecipes(
    query: { page?: number; limit?: number; status?: "published" | "private" },
    user: CurrentUser,
  ) {
    const statuses = query.status ? [query.status] : ["published", "private"];
    return this.ownList(query, statuses, "published", user);
  }

  private async ownList(
    query: { page?: number; limit?: number },
    statuses: string[],
    orderBy: "updated" | "published",
    user: CurrentUser,
  ) {
    const { page, limit, offset } = parsePagination(query);
    const [rows, total] = await Promise.all([
      this.recipesRepo.listOwnCards(user.userId, statuses, orderBy, { limit, offset }),
      this.recipesRepo.countOwn(user.userId, statuses),
    ]);
    return paginated(rows.map((r) => this.mapCard(r, user)), page, limit, total);
  }

  private mapCard(row: Parameters<typeof mapRecipeCard>[0], user: CurrentUser) {
    return mapRecipeCard(row, user.userId, (b, p) => this.storage.publicUrl(b, p));
  }

  private mapMe(row: MeRow) {
    return {
      user_id: row.user.userId,
      username: row.user.username,
      display_name: row.user.displayName,
      email: row.user.email,
      profile_picture_url: row.user.profilePicturePath
        ? this.storage.publicUrl(BUCKETS.avatars, row.user.profilePicturePath)
        : null,
      role: row.user.role,
      tier: row.tier
        ? { tier_id: row.tier.tierId, name: row.tier.name, min_likes: row.tier.minLikes }
        : null,
      total_likes_received: row.totalLikesReceived,
      created_at: row.user.createdAt.toISOString(),
    };
  }
}

export const profileService = new ProfileService();
