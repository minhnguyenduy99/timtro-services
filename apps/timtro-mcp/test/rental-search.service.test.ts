import { describe, expect, it } from "vitest";

import { searchRentals } from "../src/search-rentals";
import type { RentalRecord } from "../src/types";

const sampleItems: RentalRecord[] = [
  {
    id: "1",
    title: "Phòng trọ Bình Thạnh",
    text: "Giá thuê 2.5 triệu/tháng, gần chợ"
  },
  {
    id: "2",
    title: "Phòng Quận 1",
    text: "Cho thuê phòng trọ, giá 5 triệu/tháng"
  },
  {
    id: "3",
    title: "Phòng Thủ Đức",
    text: "Khu làng đại học, giá 2tr8"
  }
];

describe("searchRentals", () => {
  it("filters listings by area query", () => {
    const hits = searchRentals(sampleItems, {
      areaQuery: "Bình Thạnh",
      limit: 10,
      strictPriceFilter: false
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("1");
  });

  it("filters listings by max price", () => {
    const hits = searchRentals(sampleItems, {
      areaQuery: "Quận 1",
      maxPriceVnd: 4_000_000,
      limit: 10,
      strictPriceFilter: false
    });

    expect(hits).toHaveLength(0);
  });

  it("respects the result limit", () => {
    const hits = searchRentals(sampleItems, {
      areaQuery: "Thủ Đức",
      limit: 1,
      strictPriceFilter: false
    });

    expect(hits).toHaveLength(1);
  });
});
