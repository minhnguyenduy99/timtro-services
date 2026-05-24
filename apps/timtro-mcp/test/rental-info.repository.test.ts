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
  it("queries byPostDate index with descending order by default", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [validItem] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          IndexName: "byPostDate",
          ScanIndexForward: false
        })
      })
    );
  });

  it("queries byPostDate ascending when sort is date|asc", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [validItem] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    await repository.queryByRegion("ho_chi_minh_binh_thanh", {
      sort: { field: "date", order: "asc" }
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          IndexName: "byPostDate",
          ScanIndexForward: true
        })
      })
    );
  });

  it("queries byPrice index with price > 0 in key condition", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [validItem] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    await repository.queryByRegion("ho_chi_minh_binh_thanh", {
      sort: { field: "price", order: "asc" }
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          IndexName: "byPrice",
          ScanIndexForward: true,
          KeyConditionExpression: "#region = :region AND #price > :zero",
          ExpressionAttributeNames: expect.objectContaining({ "#price": "price" }),
          ExpressionAttributeValues: expect.objectContaining({ ":zero": 0 })
        })
      })
    );
  });

  it("adds postDate cutoff to key condition on date index queries", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [validItem] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    await repository.queryByRegion("ho_chi_minh_binh_thanh", {
      sort: { field: "date", order: "desc" },
      dateRangeCutoff: "2026-05-18T00:00:00.000Z"
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          KeyConditionExpression: "#region = :region AND #postDate >= :cutoff",
          ExpressionAttributeNames: expect.objectContaining({ "#postDate": "postDate" }),
          ExpressionAttributeValues: expect.objectContaining({
            ":cutoff": "2026-05-18T00:00:00.000Z"
          })
        })
      })
    );
    expect(send.mock.calls[0]?.[0].input.FilterExpression).toBeUndefined();
  });

  it("merges paginated query results", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [validItem],
        LastEvaluatedKey: { region: "ho_chi_minh_binh_thanh", postDate: validItem.postDate, id: "fb_123" }
      })
      .mockResolvedValueOnce({
        Items: [{ ...validItem, id: "fb_456", sourcePostId: "456" }]
      });

    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");
    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array when DynamoDB has no items", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [] });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    await expect(repository.queryByRegion("ho_chi_minh_binh_thanh")).resolves.toEqual([]);
  });

  it("propagates DynamoDB errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("AccessDeniedException"));
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    await expect(repository.queryByRegion("ho_chi_minh_binh_thanh")).rejects.toThrow("AccessDeniedException");
  });

  it("skips rows that fail schema validation", async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [validItem, { ...validItem, price: 123 }]
    });
    const repository = new DynamoRentalInfoRepository({ send } as never, "timtro-rental-info-v2-dev");

    const rows = await repository.queryByRegion("ho_chi_minh_binh_thanh");

    expect(rows).toHaveLength(1);
  });
});
