import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveCachePath } from "../src/cache-loader";

describe("resolveCachePath", () => {
  const originalEnv = process.env.TIMTRO_CACHE_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TIMTRO_CACHE_PATH;
    } else {
      process.env.TIMTRO_CACHE_PATH = originalEnv;
    }
  });

  it("uses an explicit path when provided", () => {
    expect(resolveCachePath("/tmp/cache.json")).toBe(path.resolve("/tmp/cache.json"));
  });

  it("uses TIMTRO_CACHE_PATH when set", () => {
    process.env.TIMTRO_CACHE_PATH = "/var/data/rentals.json";

    expect(resolveCachePath()).toBe(path.resolve("/var/data/rentals.json"));
  });

  it("falls back to cache_rentals.json in cwd", () => {
    delete process.env.TIMTRO_CACHE_PATH;

    expect(resolveCachePath()).toBe(path.resolve(process.cwd(), "cache_rentals.json"));
  });
});
