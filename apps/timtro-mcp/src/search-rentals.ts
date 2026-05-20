import type { RentalRecord, SearchHit } from './types.js';
import { RentalSearchService } from './services/rental-search.service.js';

export function getFullText(row: RentalRecord): string {
  const parts = [row.title, row.text, row.body, row.content, row.message].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0
  );
  return parts.join('\n').trim();
}

export type SearchParams = {
  areaQuery: string;
  maxPriceVnd?: number;
  limit: number;
  /** If true, rows without a parsable rent are dropped when maxPriceVnd is set. */
  strictPriceFilter: boolean;
};

export function searchRentals(items: RentalRecord[], params: SearchParams): SearchHit[] {
  return new RentalSearchService().searchRentals(items, params);
}
