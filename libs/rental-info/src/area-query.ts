import { buildRegion } from "./rental-info";
import { isKnownDistrictKey, resolveDistrict, type RegionEntry } from "./region-mapping";

const DEFAULT_CITY = "ho_chi_minh";

const AREA_QUERY_SPLIT = /[,;/|]+|\s+và\s+/i;

export function resolveAreaQueryToRegions(areaQuery: string): {
  regions: string[];
  districts: RegionEntry[];
} {
  const trimmed = areaQuery.trim();
  if (!trimmed) {
    return { regions: [], districts: [] };
  }

  const tokens = trimmed
    .split(AREA_QUERY_SPLIT)
    .map((token) => token.trim())
    .filter(Boolean);

  const queryTokens = tokens.length > 0 ? tokens : [trimmed];
  const seenKeys = new Set<string>();
  const districts: RegionEntry[] = [];
  const regions: string[] = [];

  for (const token of queryTokens) {
    const district = resolveDistrict(token);
    if (!district.key || !isKnownDistrictKey(district.key) || seenKeys.has(district.key)) {
      continue;
    }

    seenKeys.add(district.key);
    districts.push(district);
    regions.push(buildRegion(DEFAULT_CITY, district.key));
  }

  return { regions, districts };
}
