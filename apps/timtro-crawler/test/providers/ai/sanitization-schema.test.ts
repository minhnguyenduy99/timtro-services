import { describe, expect, it } from "vitest";

import { mapApifyPostToRawPost } from "../../../src/domain/raw-rental-post";
import { UNKNOWN_RENTAL_PRICE } from "../../../src/domain/rent-price";
import { DomainValidationError } from "../../../src/domain/schemas";
import {
  normalizeAiSanitizationResponse,
  parseAiSanitizationResponse
} from "../../../src/providers/ai/sanitization-schema";

const rawPost = mapApifyPostToRawPost({
  facebookId: "2573980229535866",
  legacyId: "4680482768885591",
  url: "https://www.facebook.com/groups/binhthanh.phongtro.club/permalink/4680482768885591/",
  time: "2026-05-23T02:20:59.000Z",
  text: "Cho thuê studio"
});

const validRental = {
  sourcePostId: "post-1",
  address: "123 Nguyen Trai",
  city: "Ho Chi Minh",
  district: "District 1",
  title: "Phong tro Quan 1",
  postDate: "2026-05-19T00:00:00.000Z",
  timestamp: "2026-05-20T00:00:00.000Z",
  originalLink: "https://facebook.com/post",
  attachments: [{ type: "photo", url: "https://example.com/photo.jpg" }]
};

describe("AI sanitization response schema", () => {
  it("returns validated rental info records", () => {
    expect(parseAiSanitizationResponse({ classification: "rental", rentals: [validRental] })).toMatchObject({
      classification: "rental",
      records: [
        {
          id: "fb_post-1",
          region: "ho_chi_minh_district_1",
          city: "ho_chi_minh",
          cityLabel: "Hồ Chí Minh",
          district: "district_1",
          districtLabel: "Quận 1",
          price: UNKNOWN_RENTAL_PRICE,
          priceUnit: "VND"
        }
      ]
    });
  });

  it("returns an empty record list for non-rental classification", () => {
    expect(parseAiSanitizationResponse({ classification: "non_rental", rentals: [] })).toEqual({
      classification: "non_rental",
      records: []
    });
  });

  it("rejects invalid JSON-shaped provider output", () => {
    expect(() => parseAiSanitizationResponse({ classification: "rental", rentals: [] })).toThrow(
      DomainValidationError
    );
  });

  it("maps raw post text to description during sanitization normalization", () => {
    expect(
      parseAiSanitizationResponse(
        normalizeAiSanitizationResponse(rawPost, {
          classification: "rental",
          rentals: [validRental]
        })
      )
    ).toMatchObject({
      classification: "rental",
      records: [
        {
          description: "Cho thuê studio"
        }
      ]
    });
  });

  it("normalizes Gemini rentals with numeric timestamps and missing sourcePostId", () => {
    expect(
      parseAiSanitizationResponse(
        normalizeAiSanitizationResponse(rawPost, {
          classification: "rental",
          rentals: [
            {
              address: "5 No Trang Long",
              city: "Ho Chi Minh",
              district: "Binh Thanh",
              title: "Cho thue studio, gia 3tr2",
              postDate: "2026-05-23T02:20:59.000Z",
              timestamp: 1_779_541_259_000,
              originalLink: "https://www.facebook.com/groups/binhthanh.phongtro.club/permalink/4680482768885591/",
              attachments: [{ type: "photo", url: "https://example.com/photo.jpg" }]
            }
          ]
        })
      )
    ).toMatchObject({
      classification: "rental",
      records: [
        {
          id: "fb_4680482768885591",
          region: "ho_chi_minh_binh_thanh",
          city: "ho_chi_minh",
          cityLabel: "Hồ Chí Minh",
          district: "binh_thanh",
          districtLabel: "Bình Thạnh",
          price: 3_200_000,
          priceUnit: "VND",
          description: "Cho thuê studio"
        }
      ]
    });
  });
});
