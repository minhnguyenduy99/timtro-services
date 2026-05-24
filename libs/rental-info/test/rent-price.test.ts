import { describe, expect, it } from "vitest";

import {
  isValidRentalPrice,
  parseMonthlyRentVnd,
  resolveRentalPrice,
  UNKNOWN_RENTAL_PRICE
} from "../src/rent-price";

const phoneListing = `💥 Cuối Tháng Trống Căn Hộ 1PN Siêu Phẩm Tới
🏠 Địa Chỉ : 21 Bình Lợi - Bình Thạnh
📞 Liên hệ : 0382.714.306 Zalo/Mess`;

describe("parseMonthlyRentVnd", () => {
  it("parses shorthand monthly rents from Vietnamese listing text", () => {
    expect(parseMonthlyRentVnd("Phòng trọ 133 Nguyễn Thượng Hiền, giá 3tr2")).toEqual({
      price: 3_200_000
    });
  });

  it("parses triệu amounts with rent context", () => {
    expect(parseMonthlyRentVnd("Cho thuê phòng trọ, giá 3.5 triệu/tháng")).toEqual({
      price: 3_500_000
    });
  });

  it("ignores phone numbers in contact sections", () => {
    expect(parseMonthlyRentVnd(phoneListing)).toBeUndefined();
  });
});

describe("isValidRentalPrice", () => {
  it("accepts monthly rents divisible by 1000 within the expected range", () => {
    expect(isValidRentalPrice(3_200_000)).toBe(true);
    expect(isValidRentalPrice(7_800_000)).toBe(true);
  });

  it("rejects phone-like amounts and non-multiples of 1000", () => {
    expect(isValidRentalPrice(714_306)).toBe(false);
    expect(isValidRentalPrice(3_200_500)).toBe(false);
  });
});

describe("resolveRentalPrice", () => {
  it("rejects AI-provided phone fragments and falls back to -1", () => {
    expect(
      resolveRentalPrice({
        aiPrice: 714_306,
        text: phoneListing
      })
    ).toEqual({
      price: UNKNOWN_RENTAL_PRICE,
      priceUnit: "VND"
    });
  });

  it("keeps valid AI-provided monthly rents", () => {
    expect(
      resolveRentalPrice({
        aiPrice: 7_800_000,
        text: "Giá 7.8 triệu/tháng"
      })
    ).toEqual({
      price: 7_800_000,
      priceUnit: "VND"
    });
  });
});
