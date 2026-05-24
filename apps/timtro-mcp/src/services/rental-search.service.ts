import {
  resolveAreaQueryToRegions,
  UNKNOWN_RENTAL_PRICE,
  type RentalInfo
} from "@timtro/rental-info";

import type { RentalInfoRepository } from "./rental-info.repository";

export type SearchParams = {
  areaQuery: string;
  maxPriceVnd?: number;
  limit: number;
  strictPriceFilter: boolean;
};

export type SearchResultItem = {
  id: string;
  title: string;
  description: string;
  address: string;
  cityLabel: string;
  districtLabel: string;
  priceVnd: number;
  priceUnknown: boolean;
  originalLink: string;
  postDate: string;
  attachments: RentalInfo["attachments"];
  source: RentalInfo["source"];
};

export type SearchResult = {
  resolvedRegions: string[];
  count: number;
  results: SearchResultItem[];
};

export class RentalSearchService {
  constructor(private readonly repository: RentalInfoRepository) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const limit = Math.min(Math.max(params.limit, 1), 50);
    const { regions } = resolveAreaQueryToRegions(params.areaQuery);

    if (regions.length === 0) {
      return { resolvedRegions: [], count: 0, results: [] };
    }

    const regionResults = await Promise.all(
      regions.map((region) => this.repository.queryByRegion(region, { limit }))
    );

    const merged = regionResults
      .flat()
      .filter((item) => this.matchesPriceFilter(item, params))
      .sort((a, b) => b.postDate.localeCompare(a.postDate))
      .slice(0, limit)
      .map((item) => this.toSearchResultItem(item));

    return {
      resolvedRegions: regions,
      count: merged.length,
      results: merged
    };
  }

  private matchesPriceFilter(item: RentalInfo, params: SearchParams): boolean {
    if (params.maxPriceVnd === undefined) {
      return true;
    }

    if (item.price === UNKNOWN_RENTAL_PRICE) {
      return !params.strictPriceFilter;
    }

    return item.price <= params.maxPriceVnd;
  }

  private toSearchResultItem(item: RentalInfo): SearchResultItem {
    const priceUnknown = item.price === UNKNOWN_RENTAL_PRICE;

    return {
      id: item.id,
      title: item.title,
      description: item.description,
      address: item.address,
      cityLabel: item.cityLabel,
      districtLabel: item.districtLabel,
      priceVnd: item.price,
      priceUnknown,
      originalLink: item.originalLink,
      postDate: item.postDate,
      attachments: item.attachments,
      source: item.source
    };
  }
}
