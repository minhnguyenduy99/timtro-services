import { describe, expect, it, vi } from "vitest";

import { DynamoRentalInfoRepository } from "../src/services/rental-info.repository";

const validItem = {
  region: "ho_chi_minh_binh_thanh",
  id: "fb_123",
  source: "fb" as const,
  sourcePostId: "123",
  address: "123 Nguyen Trai",
  city: "ho_chi_minh",
  cityLabel: "Hồ Chí Minh",
  district: "binh_thanh",
  districtLabel: "Bình Thạnh",
  title: "Phong tro",
  description: "Mo ta",
  price: 2_500_000,
  priceUnit: "VND" as const,
  postDate: "2026-05-19T00:00:00.000Z",
  timestamp: "2026-05-20T00:00:00.000Z",
  originalLink: "https://facebook.com/groups/1/posts/123",
  attachments: []
};

describe("DynamoRentalInfoRepository", () => {
  it("returns validated rental info rows from a query", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [validItem] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-dev");

    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("fb_123");
  });

  it("merges paginated query results", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [validItem],
        LastEvaluatedKey: { region: "ho_chi_minh_binh_thanh", id: "fb_123" }
      })
      .mockResolvedValueOnce({
        Items: [{ ...validItem, id: "fb_456", sourcePostId: "456" }]
      });

    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-dev");
    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array when DynamoDB has no items", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-dev");

    await expect(repository.queryByRegion("ho_chi_minh_binh_thanh")).resolves.toEqual([]);
  });

  it("propagates DynamoDB errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("AccessDeniedException"));
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-dev");

    await expect(repository.queryByRegion("ho_chi_minh_binh_thanh")).rejects.toThrow("AccessDeniedException");
  });

  it("skips rows that fail schema validation", async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [validItem, { ...validItem, price: 123 }]
    });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-dev");

    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(1);
  });
});
