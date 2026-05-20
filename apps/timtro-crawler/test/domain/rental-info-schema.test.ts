import { describe, expect, it } from "vitest";

import { DomainValidationError, validateRentalInfoCandidate } from "../../src/domain/schemas";

const validCandidate = {
  sourcePostId: "4675629119370956",
  address: "123 Nguyen Trai",
  city: "Ho Chi Minh",
  district: "District 1",
  title: "Phong tro Quan 1",
  postDate: "2026-05-19T00:00:00.000Z",
  timestamp: "2026-05-20T00:00:00.000Z",
  originalLink: "https://facebook.com/groups/2573980229535866/posts/4675629119370956",
  attachments: [{ type: "photo" as const, url: "https://example.com/photo.jpg" }]
};

describe("rental info validation", () => {
  it("normalizes valid post-level rental info for DynamoDB keys", () => {
    expect(validateRentalInfoCandidate(validCandidate)).toMatchObject({
      region: "ho_chi_minh_district_1",
      id: "fb_4675629119370956",
      source: "fb"
    });
  });

  it("normalizes valid comment-level rental info with comment identity", () => {
    expect(
      validateRentalInfoCandidate({
        ...validCandidate,
        sourceCommentId: "4675629046037630",
        originalLink: "https://facebook.com/comment"
      })
    ).toMatchObject({
      id: "fb_4675629046037630",
      originalLink: "https://facebook.com/comment"
    });
  });

  it("rejects missing city or district before a region key is written", () => {
    expect(() => validateRentalInfoCandidate({ ...validCandidate, district: "" })).toThrow(DomainValidationError);
  });

  it("rejects schema-invalid AI output before persistence", () => {
    expect(() =>
      validateRentalInfoCandidate({
        ...validCandidate,
        address: "",
        postDate: "yesterday",
        attachments: [{ type: "document", url: "https://example.com/file.pdf" }]
      })
    ).toThrow(DomainValidationError);
  });
});
