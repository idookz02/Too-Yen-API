import { describe, expect, it } from "bun:test";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  paginated,
  parsePagination,
} from "../src/shared/utils/pagination";

describe("parsePagination", () => {
  it("defaults to page 1, limit 20", () => {
    expect(parsePagination()).toEqual({ page: 1, limit: DEFAULT_LIMIT, offset: 0 });
  });

  it("clamps limit to 100", () => {
    expect(parsePagination({ limit: 500 }).limit).toBe(MAX_LIMIT);
  });

  it("floors page/limit below 1 back to sane values", () => {
    expect(parsePagination({ page: 0, limit: 0 })).toEqual({
      page: 1,
      limit: DEFAULT_LIMIT,
      offset: 0,
    });
    expect(parsePagination({ page: -3, limit: -5 }).page).toBe(1);
  });

  it("computes offset from page", () => {
    expect(parsePagination({ page: 3, limit: 20 }).offset).toBe(40);
  });
});

describe("paginated", () => {
  it("wraps data with the spec envelope", () => {
    expect(paginated([1, 2], 1, 20, 153)).toEqual({
      data: [1, 2],
      pagination: { page: 1, limit: 20, total: 153, total_pages: 8 },
    });
  });
});
