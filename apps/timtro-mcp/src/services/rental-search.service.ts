import { DISTRICT_ALIAS_GROUPS } from '../constants.js';
import { estimateMonthlyRent } from '../rent-extract.js';
import type { SearchParams } from '../search-rentals.js';
import type { RentalRecord, SearchHit } from '../types.js';

export class RentalSearchService {
  searchRentals(items: RentalRecord[], params: SearchParams): SearchHit[] {
    const limit = Math.min(Math.max(params.limit, 1), 50);
    const hits: SearchHit[] = [];

    for (const row of items) {
      const fullText = this.getFullText(row);
      if (!fullText) continue;

      if (!this.recordMatchesArea(params.areaQuery, fullText, row.district_hint)) {
        continue;
      }

      const rent = estimateMonthlyRent(fullText);
      if (params.maxPriceVnd !== undefined && rent) {
        if (rent.amountVnd > params.maxPriceVnd) continue;
      }
      if (params.maxPriceVnd !== undefined && !rent && params.strictPriceFilter) {
        continue;
      }

      const districtMatches = this.districtsFoundInListing(fullText, row.district_hint);

      const preview = fullText.length > 400 ? `${fullText.slice(0, 400)}…` : fullText;

      hits.push({
        id: row.id,
        url: row.url,
        source: row.source,
        districtMatches,
        rent,
        textPreview: preview,
        fullText
      });

      if (hits.length >= limit) break;
    }

    return hits;
  }

  private getFullText(row: RentalRecord): string {
    const parts = [row.title, row.text, row.body, row.content, row.message].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0
    );
    return parts.join('\n').trim();
  }

  private normalizeVi(s: string): string {
    return s
      .normalize('NFC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private queryTokens(areaQuery: string): string[] {
    const q = this.normalizeVi(areaQuery);
    const split = q.split(/[,;/|]+|\s+và\s+/).map((t) => t.trim()).filter(Boolean);
    return split.length > 0 ? split : [q];
  }

  private canonicalTargetsFromQuery(areaQuery: string): Set<string> {
    const tokens = this.queryTokens(areaQuery);
    const targets = new Set<string>();

    for (const token of tokens) {
      if (token.length < 2) continue;
      for (const group of DISTRICT_ALIAS_GROUPS) {
        const cn = this.normalizeVi(group.canonical);
        if (cn.includes(token) || token.includes(cn)) {
          targets.add(group.canonical);
        }
        for (const alias of group.aliases) {
          const a = this.normalizeVi(alias);
          if (a.includes(token) || token.includes(a)) {
            targets.add(group.canonical);
          }
        }
      }
    }

    return targets;
  }

  private districtsFoundInListing(haystack: string, districtHint?: string): string[] {
    const text = this.normalizeVi(`${haystack} ${districtHint ?? ''}`);
    const hits = new Set<string>();

    for (const group of DISTRICT_ALIAS_GROUPS) {
      const cn = this.normalizeVi(group.canonical);
      if (cn.length >= 3 && text.includes(cn)) {
        hits.add(group.canonical);
      }
      for (const alias of group.aliases) {
        const a = this.normalizeVi(alias);
        if (a.length >= 2 && text.includes(a)) {
          hits.add(group.canonical);
        }
      }
    }

    return [...hits];
  }

  private recordMatchesArea(areaQuery: string, haystack: string, districtHint?: string): boolean {
    const text = this.normalizeVi(haystack);
    const hint = this.normalizeVi(districtHint ?? '');
    const targets = this.canonicalTargetsFromQuery(areaQuery);

    const inListing = new Set(this.districtsFoundInListing(haystack, districtHint));

    if (targets.size > 0) {
      for (const t of targets) {
        if (inListing.has(t)) return true;
      }
    }

    const tokens = this.queryTokens(areaQuery);
    for (const token of tokens) {
      if (token.length >= 3 && (text.includes(token) || hint.includes(token))) {
        return true;
      }
    }

    return false;
  }
}
