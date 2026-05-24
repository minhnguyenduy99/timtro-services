import { describe, expect, it } from "vitest";

import { listSupportedAreas } from "@timtro/rental-info";

describe("get_areas catalog", () => {
  it("returns ho_chi_minh with a non-empty district list", () => {
    const cities = listSupportedAreas();
    const hcm = cities.find((city) => city.city === "ho_chi_minh");

    expect(hcm).toBeDefined();
    expect(hcm?.districtList.length).toBeGreaterThan(0);
  });

  it("returns stable ordering", () => {
    expect(listSupportedAreas()).toEqual(listSupportedAreas());
  });
});
