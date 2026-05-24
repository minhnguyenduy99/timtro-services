import { describe, expect, it, vi } from "vitest";

import { UNKNOWN_RENTAL_PRICE, type RentalInfo } from "@timtro/rental-info";

import type { RentalInfoRepository } from "../src/services/rental-info.repository";
import { parseSearchSort, RentalSearchService } from "../src/services/rental-search.service";

function makeListing(overrides: Partial<RentalInfo> = {}): RentalInfo {
  return {
    region: "ho_chi_minh_binh_thanh",
    id: "fb_1",
    source: "fb",
    sourcePostId: "1",
    address: "123 Nguyen Trai",
    city: "ho_chi_minh",
    cityLabel: "Hồ Chí Minh",
    district: "binh_thanh",
    districtLabel: "Bình Thạnh",
    title: "Phong tro Binh Thanh",
    description: "Mo ta",
    price: 2_500_000,
    priceUnit: "VND",
    postDate: "2026-05-20T00:00:00.000Z",
    timestamp: "2026-05-20T00:00:00.000Z",
    originalLink: "https://facebook.com/groups/1/posts/1",
    attachments: [],
    ...overrides
  };
}

describe("parseSearchSort", () => {
  it("parses valid sort strings", () => {
    expect(parseSearchSort("date|desc")).toEqual({ field: "date", order: "desc" });
    expect(parseSearchSort("price|asc")).toEqual({ field: "price", order: "asc" });
  });

  it("rejects invalid sort strings", () => {
    expect(() => parseSearchSort("date-desc")).toThrow(/Invalid sort format/);
  });
});

describe("RentalSearchService", () => {
  it("returns matching listings filtered by max price for a single region", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([
        makeListing({ id: "fb_1", price: 2_500_000 }),
        makeListing({ id: "fb_2", price: 4_000_000 })
      ])
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      maxPriceVnd: 3_000_000,
      limit: 10,
      strictPriceFilter: false
    });

    expect(result.resolvedRegions).toEqual(["ho_chi_minh_binh_thanh"]);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.id).toBe("fb_1");
    expect(repository.queryByRegion).toHaveBeenCalledWith(
      "ho_chi_minh_binh_thanh",
      expect.objectContaining({ sort: { field: "date", order: "desc" } })
    );
  });

  it("merges multi-region results sorted by postDate desc", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn(async (region: string) => {
        if (region === "ho_chi_minh_binh_thanh") {
          return [makeListing({ id: "fb_old", postDate: "2026-05-18T00:00:00.000Z" })];
        }
        return [makeListing({ id: "fb_new", region: "ho_chi_minh_thu_duc", postDate: "2026-05-21T00:00:00.000Z" })];
      })
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh,thu_duc",
      limit: 10,
      strictPriceFilter: false
    });

    expect(result.results.map((item) => item.id)).toEqual(["fb_new", "fb_old"]);
  });

  it("sorts by price ascending", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([
        makeListing({ id: "fb_high", price: 4_000_000 }),
        makeListing({ id: "fb_low", price: 2_000_000 })
      ])
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      sort: { field: "price", order: "asc" },
      limit: 10,
      strictPriceFilter: false
    });

    expect(result.results.map((item) => item.id)).toEqual(["fb_low", "fb_high"]);
  });

  it("ignores non-positive dateRangeDays", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([makeListing()])
    };

    const service = new RentalSearchService(repository);
    await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      dateRangeDays: -1,
      limit: 10,
      strictPriceFilter: false
    });

    expect(repository.queryByRegion).toHaveBeenCalledWith(
      "ho_chi_minh_binh_thanh",
      expect.not.objectContaining({ dateRangeCutoff: expect.any(String) })
    );
  });

  it("passes date cutoff to repository for date sort", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));

    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([makeListing()])
    };

    const service = new RentalSearchService(repository);
    await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      dateRangeDays: 5,
      sort: { field: "date", order: "desc" },
      limit: 10,
      strictPriceFilter: false
    });

    expect(repository.queryByRegion).toHaveBeenCalledWith(
      "ho_chi_minh_binh_thanh",
      expect.objectContaining({
        dateRangeCutoff: "2026-05-19T12:00:00.000Z"
      })
    );

    vi.useRealTimers();
  });

  it("applies date filter post-fetch when sorting by price", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));

    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([
        makeListing({ id: "fb_recent", postDate: "2026-05-23T00:00:00.000Z" }),
        makeListing({ id: "fb_old", postDate: "2026-05-10T00:00:00.000Z" })
      ])
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      dateRangeDays: 5,
      sort: { field: "price", order: "asc" },
      limit: 10,
      strictPriceFilter: false
    });

    expect(result.results.map((item) => item.id)).toEqual(["fb_recent"]);
    expect(repository.queryByRegion).toHaveBeenCalledWith(
      "ho_chi_minh_binh_thanh",
      expect.not.objectContaining({ dateRangeCutoff: expect.any(String) })
    );

    vi.useRealTimers();
  });

  it("returns empty results when no regions resolve", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn()
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "hanoi",
      district: "binh_thanh",
      limit: 10,
      strictPriceFilter: false
    });

    expect(result).toEqual({ resolvedRegions: [], count: 0, results: [] });
    expect(repository.queryByRegion).not.toHaveBeenCalled();
  });

  it("includes unknown-price rows when max price is set without strict mode", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([makeListing({ price: UNKNOWN_RENTAL_PRICE })])
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      maxPriceVnd: 3_000_000,
      limit: 10,
      strictPriceFilter: false
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.priceUnknown).toBe(true);
    expect(result.results[0]?.priceVnd).toBe(UNKNOWN_RENTAL_PRICE);
  });

  it("excludes unknown-price rows when strict mode is enabled", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockResolvedValue([makeListing({ price: UNKNOWN_RENTAL_PRICE })])
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh",
      maxPriceVnd: 3_000_000,
      limit: 10,
      strictPriceFilter: true
    });

    expect(result.results).toHaveLength(0);
  });

  it("applies the global limit after merging regions", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn(async (region: string) => {
        if (region === "ho_chi_minh_binh_thanh") {
          return [
            makeListing({ id: "fb_1", postDate: "2026-05-21T00:00:00.000Z" }),
            makeListing({ id: "fb_2", postDate: "2026-05-20T00:00:00.000Z" })
          ];
        }
        return [makeListing({ id: "fb_3", region: "ho_chi_minh_thu_duc", postDate: "2026-05-19T00:00:00.000Z" })];
      })
    };

    const service = new RentalSearchService(repository);
    const result = await service.search({
      city: "ho_chi_minh",
      district: "binh_thanh,thu_duc",
      limit: 2,
      strictPriceFilter: false
    });

    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.id)).toEqual(["fb_1", "fb_2"]);
  });

  it("propagates repository errors", async () => {
    const repository: RentalInfoRepository = {
      queryByRegion: vi.fn().mockRejectedValue(new Error("DynamoDB unavailable"))
    };

    const service = new RentalSearchService(repository);

    await expect(
      service.search({
        city: "ho_chi_minh",
        district: "binh_thanh",
        limit: 10,
        strictPriceFilter: false
      })
    ).rejects.toThrow("DynamoDB unavailable");
  });
});
