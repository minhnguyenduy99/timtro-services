import { describe, expect, it } from "vitest";

import { estimateMonthlyRent } from "../src/rent-extract";

describe("estimateMonthlyRent", () => {
  it("parses triệu amounts with rent context", () => {
    const result = estimateMonthlyRent("Cho thuê phòng trọ, giá 3.5 triệu/tháng");

    expect(result?.amountVnd).toBe(3_500_000);
    expect(result?.confidence).toBe("high");
  });

  it("parses shorthand tr amounts", () => {
    const result = estimateMonthlyRent("Phòng trọ 133 Nguyễn Thượng Hiền, giá 3tr2");

    expect(result?.amountVnd).toBe(3_200_000);
  });

  it("prefers rent context over deposit amounts", () => {
    const result = estimateMonthlyRent("Giá thuê 3tr, cọc 6tr");

    expect(result?.amountVnd).toBe(3_000_000);
  });

  it("returns undefined when no price is found", () => {
    expect(estimateMonthlyRent("Phòng trọ đẹp, liên hệ Zalo")).toBeUndefined();
  });
});
