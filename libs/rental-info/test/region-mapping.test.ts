import { describe, expect, it } from "vitest";

import { resolveCity, resolveDistrict, resolveRegionFields } from "../src/region-mapping";

describe("region mapping", () => {
  it("maps city aliases to a single canonical key and label", () => {
    for (const alias of ["Ho Chi Minh", "Hồ Chí Minh", "HCMC", "Saigon", "ho_chi_minh"]) {
      expect(resolveCity(alias)).toEqual({
        key: "ho_chi_minh",
        label: "Hồ Chí Minh"
      });
    }
  });

  it("maps district aliases to a single canonical key and label", () => {
    for (const alias of ["District 1", "Quận 1", "Q1", "district_1"]) {
      expect(resolveDistrict(alias)).toEqual({
        key: "district_1",
        label: "Quận 1"
      });
    }

    for (const alias of ["Binh Thanh", "Bình Thạnh", "binh_thanh"]) {
      expect(resolveDistrict(alias)).toEqual({
        key: "binh_thanh",
        label: "Bình Thạnh"
      });
    }
  });

  it("returns stable region keys regardless of AI label variation", () => {
    expect(resolveRegionFields("HCMC", "Q1")).toEqual({
      city: "ho_chi_minh",
      cityLabel: "Hồ Chí Minh",
      district: "district_1",
      districtLabel: "Quận 1"
    });

    expect(resolveRegionFields("Hồ Chí Minh", "Bình Thạnh")).toEqual({
      city: "ho_chi_minh",
      cityLabel: "Hồ Chí Minh",
      district: "binh_thanh",
      districtLabel: "Bình Thạnh"
    });
  });
});
