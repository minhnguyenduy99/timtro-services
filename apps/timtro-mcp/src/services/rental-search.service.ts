import {
  resolveCityDistrictsToRegions,
  UNKNOWN_RENTAL_PRICE,
  type RentalInfo
} from "@timtro/rental-info";

import type { RentalInfoQueryOptions, RentalInfoRepository, SortField, SortOrder } from "./rental-info.repository";

export type SearchSort = {
  field: SortField;
  order: SortOrder;
};

export type SearchParams = {
  city: string;
  district: string;
  maxPriceVnd?: number;
  limit: number;
  strictPriceFilter: boolean;
  dateRangeDays?: number;
  sort?: SearchSort;
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

const DEFAULT_SORT: SearchSort = { field: "date", order: "desc" };

export class RentalSearchService {
  constructor(private readonly repository: RentalInfoRepository) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const limit = Math.min(Math.max(params.limit, 1), 50);
    const sort = params.sort ?? DEFAULT_SORT;
    const { regions } = resolveCityDistrictsToRegions(params.city, params.district);

    if (regions.length === 0) {
      return { resolvedRegions: [], count: 0, results: [] };
    }

    const dateRangeDays =
      params.dateRangeDays !== undefined && params.dateRangeDays > 0 ? params.dateRangeDays : undefined;

    const dateRangeCutoff =
      sort.field === "date" && dateRangeDays !== undefined
        ? new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

    const queryOptions: RentalInfoQueryOptions = {
      limit,
      sort,
      ...(dateRangeCutoff ? { dateRangeCutoff } : {})
    };

    const regionResults = await Promise.all(
      regions.map((region) => this.repository.queryByRegion(region, queryOptions))
    );

    let merged = this.mergeSortedResults(regionResults.flat(), sort);
    merged = merged.filter((item) => this.matchesPriceFilter(item, params));

    if (sort.field === "price" && dateRangeDays !== undefined) {
      const cutoff = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000).toISOString();
      merged = merged.filter((item) => item.postDate >= cutoff);
    }

    const results = merged.slice(0, limit).map((item) => this.toSearchResultItem(item));

    return {
      resolvedRegions: regions,
      count: results.length,
      results
    };
  }

  private mergeSortedResults(items: RentalInfo[], sort: SearchSort): RentalInfo[] {
    if (items.length <= 1) {
      return items;
    }

    return [...items].sort((a, b) => this.compareItems(a, b, sort));
  }

  private compareItems(a: RentalInfo, b: RentalInfo, sort: SearchSort): number {
    if (sort.field === "price") {
      const priceCompare = a.price - b.price;
      return sort.order === "asc" ? priceCompare : -priceCompare;
    }

    const dateCompare = a.postDate.localeCompare(b.postDate);
    return sort.order === "asc" ? dateCompare : -dateCompare;
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

export function parseSearchSort(value: string): SearchSort {
  const [field, order] = value.split("|");
  if ((field !== "date" && field !== "price") || (order !== "asc" && order !== "desc")) {
    throw new Error(`Invalid sort format "${value}". Expected "<field>|<order>" where field is date|price and order is asc|desc.`);
  }

  return { field, order };
}
