import { describe, expect, it } from "vitest";

import { resolveCityDistrictsToRegions } from "../src/area-query";

describe("resolveCityDistrictsToRegions", () => {
  it("resolves a single district to a region key", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "binh_thanh")).toEqual({
      regions: ["ho_chi_minh_binh_thanh"],
      districts: [{ key: "binh_thanh", label: "Bình Thạnh" }]
    });
  });

  it("resolves multiple districts from comma-separated input", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "binh_thanh,thu_duc")).toEqual({
      regions: ["ho_chi_minh_binh_thanh", "ho_chi_minh_thu_duc"],
      districts: [
        { key: "binh_thanh", label: "Bình Thạnh" },
        { key: "thu_duc", label: "Thủ Đức" }
      ]
    });
  });

  it("resolves labels and aliases", () => {
    expect(resolveCityDistrictsToRegions("Hồ Chí Minh", "Bình Thạnh, làng đại học")).toEqual({
      regions: ["ho_chi_minh_binh_thanh", "ho_chi_minh_thu_duc"],
      districts: [
        { key: "binh_thanh", label: "Bình Thạnh" },
        { key: "thu_duc", label: "Thủ Đức" }
      ]
    });
  });

  it("returns empty regions for blank district", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "   ")).toEqual({
      regions: [],
      districts: []
    });
  });

  it("returns empty regions for unknown city", () => {
    expect(resolveCityDistrictsToRegions("hanoi", "binh_thanh")).toEqual({
      regions: [],
      districts: []
    });
  });

  it("deduplicates repeated districts", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "binh_thanh, Bình Thạnh")).toEqual({
      regions: ["ho_chi_minh_binh_thanh"],
      districts: [{ key: "binh_thanh", label: "Bình Thạnh" }]
    });
  });

  it("excludes unknown district tokens", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "binh_thanh, Nguyen Trai")).toEqual({
      regions: ["ho_chi_minh_binh_thanh"],
      districts: [{ key: "binh_thanh", label: "Bình Thạnh" }]
    });
  });

  it("returns empty regions when all district tokens are invalid", () => {
    expect(resolveCityDistrictsToRegions("ho_chi_minh", "Nguyen Trai")).toEqual({
      regions: [],
      districts: []
    });
  });
});
