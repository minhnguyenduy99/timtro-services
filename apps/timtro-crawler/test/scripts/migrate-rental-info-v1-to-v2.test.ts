import { describe, expect, it, vi } from "vitest";

import {
  chunk,
  migrateRentalInfoTable,
  parseRentalInfoItem
} from "../../scripts/migrate-rental-info-v1-to-v2";

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

describe("migrate-rental-info-v1-to-v2 helpers", () => {
  it("chunks arrays", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("parses valid rental info rows", () => {
    expect(parseRentalInfoItem(validItem)).toEqual(validItem);
  });

  it("returns undefined for invalid rows", () => {
    expect(parseRentalInfoItem({ ...validItem, price: 123 })).toBeUndefined();
  });
});

describe("migrateRentalInfoTable", () => {
  it("copies validated rows to the destination table", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [validItem], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const result = await migrateRentalInfoTable({ send } as never, {
      sourceTableName: "timtro-rental-info-dev",
      destTableName: "timtro-rental-info-v2-dev"
    });

    expect(result).toEqual({ scanned: 1, written: 1, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].input.RequestItems["timtro-rental-info-v2-dev"]).toEqual([
      { PutRequest: { Item: validItem } }
    ]);
  });

  it("supports dry run without writes", async () => {
    const send = vi.fn().mockResolvedValueOnce({ Items: [validItem] });

    const result = await migrateRentalInfoTable({ send } as never, {
      sourceTableName: "timtro-rental-info-dev",
      destTableName: "timtro-rental-info-v2-dev",
      dryRun: true
    });

    expect(result).toEqual({ scanned: 1, written: 1, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips invalid rows", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Items: [validItem, { ...validItem, id: "fb_bad", price: 123 }]
    });

    const result = await migrateRentalInfoTable({ send } as never, {
      sourceTableName: "timtro-rental-info-dev",
      destTableName: "timtro-rental-info-v2-dev",
      dryRun: true
    });

    expect(result).toEqual({ scanned: 2, written: 1, skipped: 1 });
  });
});
