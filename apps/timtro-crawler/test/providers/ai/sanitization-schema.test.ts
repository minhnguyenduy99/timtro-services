import { describe, expect, it } from "vitest";

import { mapApifyPostToRawPost } from "../../../src/domain/raw-rental-post";
import { UNKNOWN_RENTAL_PRICE } from "@timtro/rental-info";
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

  it("ignores hallucinated AI timestamps for post-level rentals and uses postedAt", () => {
    expect(
      parseAiSanitizationResponse(
        normalizeAiSanitizationResponse(rawPost, {
          classification: "rental",
          rentals: [
            {
              sourcePostId: "4680743102192891",
              address: "07 Nguyen Ngoc Phuong",
              city: "Ho Chi Minh",
              district: "Binh Thanh",
              title: "Mot can phong studio sieu rong",
              postDate: "2026-05-23T07:43:42.000Z",
              timestamp: "2023-10-27T10:00:00.000Z",
              originalLink: "https://www.facebook.com/groups/binhthanh.phongtro.club/permalink/4680743102192891/",
              attachments: [{ type: "photo", url: "https://example.com/photo.jpg" }]
            }
          ]
        })
      )
    ).toMatchObject({
      classification: "rental",
      records: [
        {
          id: "fb_4680743102192891",
          postDate: "2026-05-23T07:43:42.000Z",
          timestamp: "2026-05-23T02:20:59.000Z"
        }
      ]
    });
  });

  it("uses comment timestamps for comment-derived rentals", () => {
    const postWithComment = mapApifyPostToRawPost({
      facebookId: "2573980229535866",
      legacyId: "4680482768885591",
      url: "https://www.facebook.com/groups/binhthanh.phongtro.club/permalink/4680482768885591/",
      time: "2026-05-23T02:20:59.000Z",
      text: "Cho thuê studio",
      topComments: [
        {
          commentId: "4675629046037630",
          commentUrl: "https://facebook.com/comment",
          text: "Phong rieng",
          time: "2026-05-23T08:15:00.000Z"
        }
      ]
    });

    expect(
      parseAiSanitizationResponse(
        normalizeAiSanitizationResponse(postWithComment, {
          classification: "rental",
          rentals: [
            {
              sourcePostId: "4680482768885591",
              sourceCommentId: "4675629046037630",
              address: "456 Le Loi",
              city: "Ho Chi Minh",
              district: "Binh Thanh",
              title: "Phong rieng",
              postDate: "2026-05-23T02:20:59.000Z",
              timestamp: "2023-10-27T10:00:00.000Z",
              originalLink: "https://facebook.com/comment",
              attachments: []
            }
          ]
        })
      )
    ).toMatchObject({
      classification: "rental",
      records: [
        {
          id: "fb_4675629046037630",
          timestamp: "2026-05-23T08:15:00.000Z"
        }
      ]
    });
  });

  it("uses raw post attachments and ignores hallucinated AI attachment URLs", () => {
    const originalUrl =
      "https://scontent-hou1-1.xx.fbcdn.net/v/t39.30808-6/704810619_122113775865123546_5741936058581955408_n.jpg?oh=00_Af5fGpZFVELOwbLb7rGANSqq5vZ1pnJrQMN4laJUFX_19g&oe=6A17590B";
    const postWithAttachments = {
      ...rawPost,
      attachments: [{ type: "photo" as const, url: originalUrl }]
    };

    expect(
      parseAiSanitizationResponse(
        normalizeAiSanitizationResponse(postWithAttachments, {
          classification: "rental",
          rentals: [
            {
              ...validRental,
              attachments: [
                {
                  type: "photo",
                  url: "https://scontent-lga3-1.xx.fbcdn.net/v/t39.30808-6/705394107_122113832691123546_4001698392742102439_n.jpg"
                }
              ]
            }
          ]
        })
      )
    ).toMatchObject({
      classification: "rental",
      records: [{ attachments: [{ type: "photo", url: originalUrl }] }]
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
          description: "Cho thuê studio",
          timestamp: "2026-05-23T02:20:59.000Z"
        }
      ]
    });
  });
});
