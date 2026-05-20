import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../../src/domain/schemas";
import { parseAiSanitizationResponse } from "../../../src/providers/ai/sanitization-schema";

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
      records: [{ id: "fb_post-1", region: "ho_chi_minh_district_1" }]
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
});
