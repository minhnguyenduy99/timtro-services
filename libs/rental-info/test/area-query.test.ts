import { describe, expect, it } from "vitest";

import { resolveAreaQueryToRegions } from "../src/area-query";

describe("resolveAreaQueryToRegions", () => {
  it("resolves a single district to a region key", () => {
    expect(resolveAreaQueryToRegions("Bình Thạnh")).toEqual({
      regions: ["ho_chi_minh_binh_thanh"],
      districts: [{ key: "binh_thanh", label: "Bình Thạnh" }]
    });
  });

  it("resolves multiple districts from comma-separated query", () => {
    expect(resolveAreaQueryToRegions("Bình Thạnh, Thủ Đức")).toEqual({
      regions: ["ho_chi_minh_binh_thanh", "ho_chi_minh_thu_duc"],
      districts: [
        { key: "binh_thanh", label: "Bình Thạnh" },
        { key: "thu_duc", label: "Thủ Đức" }
      ]
    });
  });

  it("returns empty regions for blank query", () => {
    expect(resolveAreaQueryToRegions("   ")).toEqual({
      regions: [],
      districts: []
    });
  });

  it("excludes unknown tokens with no district match", () => {
    expect(resolveAreaQueryToRegions("Nguyen Trai")).toEqual({
      regions: [],
      districts: []
    });
  });

  it("resolves làng đại học alias to thu_duc", () => {
    expect(resolveAreaQueryToRegions("làng đại học")).toEqual({
      regions: ["ho_chi_minh_thu_duc"],
      districts: [{ key: "thu_duc", label: "Thủ Đức" }]
    });
  });
});
