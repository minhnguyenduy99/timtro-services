import type { SearchParams, SearchResult } from "./services/rental-search.service";
import { RentalSearchService } from "./services/rental-search.service";
import { createRentalInfoRepository } from "./services/rental-info.repository";

export type { SearchParams, SearchResult, SearchResultItem } from "./services/rental-search.service";

export async function searchRentals(params: SearchParams): Promise<SearchResult> {
  return new RentalSearchService(createRentalInfoRepository()).search(params);
}
