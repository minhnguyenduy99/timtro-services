/** One raw listing row produced by the hourly scraper / cache writer. */
export type RentalRecord = {
    id?: string;
    /** Primary free-text field (FB post body, web snippet, …). */
    text?: string;
    body?: string;
    content?: string;
    message?: string;
    title?: string;
    url?: string;
    source?: string;
    scraped_at?: string;
    district_hint?: string;
};

export type CacheFileShape =
    | RentalRecord[]
    | {
          updated_at?: string;
          items: RentalRecord[];
      };

export type RentEstimate = {
    amountVnd: number;
    confidence: 'high' | 'medium' | 'low';
    matchedSnippet: string;
};

export type SearchHit = {
    id?: string;
    url?: string;
    source?: string;
    districtMatches: string[];
    rent?: RentEstimate;
    textPreview: string;
    fullText: string;
};
