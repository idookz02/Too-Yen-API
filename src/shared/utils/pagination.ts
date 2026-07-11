/**
 * Pagination helpers — doc/api/README.md conventions:
 * `?page=1&limit=20` (default limit 20, max 100), responses wrapped as
 * `{ data, pagination: { page, limit, total, total_pages } }`.
 */
import { t } from "elysia";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Reusable query-string schema for list endpoints. */
export const PaginationQueryDTO = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, default: DEFAULT_LIMIT })),
});

export type PaginationInput = { page?: number; limit?: number };

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

/** Clamp raw query values into safe page/limit/offset. */
export function parsePagination(input: PaginationInput = {}) {
  const page = Math.max(1, Math.trunc(input.page ?? 1) || 1);
  const rawLimit = Math.trunc(input.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Build the `{ data, pagination }` envelope. */
export function paginated<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): { data: T[]; pagination: Pagination } {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

/** Response schema factory for Swagger: `{ data: T[], pagination }`. */
export const PaginatedDTO = <T extends Parameters<typeof t.Array>[0]>(item: T) =>
  t.Object({
    data: t.Array(item),
    pagination: t.Object({
      page: t.Number(),
      limit: t.Number(),
      total: t.Number(),
      total_pages: t.Number(),
    }),
  });
