import { describe, expect, it } from "vitest";

import { DomainValidationError, validateRentalInfoCandidate } from "../../src/domain/schemas";
import { UNKNOWN_RENTAL_PRICE } from "../../src/domain/rent-price";

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
      source: "fb",
      city: "ho_chi_minh",
      cityLabel: "Hồ Chí Minh",
      district: "district_1",
      districtLabel: "Quận 1",
      price: UNKNOWN_RENTAL_PRICE,
      priceUnit: "VND"
    });
  });

  it("maps alternate AI city and district labels to canonical keys", () => {
    expect(
      validateRentalInfoCandidate({
        ...validCandidate,
        city: "HCMC",
        district: "Q1"
      })
    ).toMatchObject({
      region: "ho_chi_minh_district_1",
      city: "ho_chi_minh",
      cityLabel: "Hồ Chí Minh",
      district: "district_1",
      districtLabel: "Quận 1"
    });

    expect(
      validateRentalInfoCandidate({
        ...validCandidate,
        city: "Hồ Chí Minh",
        district: "Bình Thạnh"
      })
    ).toMatchObject({
      region: "ho_chi_minh_binh_thanh",
      city: "ho_chi_minh",
      cityLabel: "Hồ Chí Minh",
      district: "binh_thanh",
      districtLabel: "Bình Thạnh"
    });
  });

  it("persists normalized monthly rent fields", () => {
    expect(
      validateRentalInfoCandidate({
        ...validCandidate,
        price: 3_200_000,
        priceUnit: "VND"
      })
    ).toMatchObject({
      price: 3_200_000,
      priceUnit: "VND"
    });
  });

  it("defaults missing description to an empty string", () => {
    expect(validateRentalInfoCandidate(validCandidate)).toMatchObject({
      description: ""
    });
  });

  it("persists description when provided on the candidate", () => {
    expect(
      validateRentalInfoCandidate({
        ...validCandidate,
        description: "Cho thue phong tro gan truong Dai hoc"
      })
    ).toMatchObject({
      description: "Cho thue phong tro gan truong Dai hoc"
    });
  });

  it("defaults missing price to -1", () => {
    expect(validateRentalInfoCandidate(validCandidate)).toMatchObject({
      price: UNKNOWN_RENTAL_PRICE,
      priceUnit: "VND"
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
