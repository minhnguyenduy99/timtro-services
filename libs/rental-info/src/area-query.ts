import { buildRegion } from "./rental-info";
import { isKnownCityKey, isKnownDistrictKey, resolveCity, resolveDistrict, type RegionEntry } from "./region-mapping";

export function resolveCityDistrictsToRegions(city: string, district: string): {
  regions: string[];
  districts: RegionEntry[];
} {
  const cityEntry = resolveCity(city);
  if (!cityEntry.key || !isKnownCityKey(cityEntry.key)) {
    return { regions: [], districts: [] };
  }

  const tokens = district
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { regions: [], districts: [] };
  }

  const seenKeys = new Set<string>();
  const districts: RegionEntry[] = [];
  const regions: string[] = [];

  for (const token of tokens) {
    const districtEntry = resolveDistrict(token);
    if (!districtEntry.key || !isKnownDistrictKey(districtEntry.key) || seenKeys.has(districtEntry.key)) {
      continue;
    }

    seenKeys.add(districtEntry.key);
    districts.push(districtEntry);
    regions.push(buildRegion(cityEntry.key, districtEntry.key));
  }

  return { regions, districts };
}
