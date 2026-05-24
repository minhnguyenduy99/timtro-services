import { describe, expect, it } from "vitest";

import { listSupportedAreas } from "../src/region-mapping";

describe("listSupportedAreas", () => {
  it("includes ho_chi_minh with a full district list", () => {
    const areas = listSupportedAreas();
    const hcm = areas.find((city) => city.city === "ho_chi_minh");

    expect(hcm).toBeDefined();
    expect(hcm?.cityLabel).toBe("Hồ Chí Minh");
    expect(hcm?.districtList.length).toBeGreaterThan(20);
    expect(hcm?.districtList).toContainEqual({ district: "binh_thanh", districtLabel: "Bình Thạnh" });
    expect(hcm?.districtList).toContainEqual({ district: "thu_duc", districtLabel: "Thủ Đức" });
  });

  it("returns stable ordering", () => {
    const first = listSupportedAreas();
    const second = listSupportedAreas();

    expect(first).toEqual(second);
    expect(first[0]?.districtList.map((district) => district.district)).toEqual(
      second[0]?.districtList.map((district) => district.district)
    );
  });
});
