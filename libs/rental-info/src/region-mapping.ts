export type RegionEntry = {
  key: string;
  label: string;
};

const CITY_ENTRIES: Array<{ entry: RegionEntry; aliases: string[] }> = [
  {
    entry: { key: "ho_chi_minh", label: "Hồ Chí Minh" },
    aliases: [
      "ho chi minh",
      "hồ chí minh",
      "hcm",
      "hcmc",
      "tp hcm",
      "tp. hcm",
      "tp ho chi minh",
      "tp. ho chi minh",
      "thanh pho ho chi minh",
      "thành phố hồ chí minh",
      "saigon",
      "sài gòn",
      "sai gon",
      "ho chi minh city",
      "ho_chi_minh"
    ]
  }
];

const DISTRICT_ENTRIES: Array<{ entry: RegionEntry; aliases: string[] }> = [
  { entry: { key: "district_1", label: "Quận 1" }, aliases: ["q1", "quận 1", "quan 1", "district 1", "district_1"] },
  { entry: { key: "district_2", label: "Quận 2" }, aliases: ["q2", "quận 2", "quan 2", "district 2", "district_2"] },
  { entry: { key: "district_3", label: "Quận 3" }, aliases: ["q3", "quận 3", "quan 3", "district 3", "district_3"] },
  { entry: { key: "district_4", label: "Quận 4" }, aliases: ["q4", "quận 4", "quan 4", "district 4", "district_4"] },
  {
    entry: { key: "district_5", label: "Quận 5" },
    aliases: ["q5", "quận 5", "quan 5", "district 5", "district_5", "chinatown", "chợ lớn", "cho lon"]
  },
  { entry: { key: "district_6", label: "Quận 6" }, aliases: ["q6", "quận 6", "quan 6", "district 6", "district_6"] },
  {
    entry: { key: "district_7", label: "Quận 7" },
    aliases: ["q7", "quận 7", "quan 7", "district 7", "district_7", "phú mỹ hưng", "phu my hung"]
  },
  { entry: { key: "district_8", label: "Quận 8" }, aliases: ["q8", "quận 8", "quan 8", "district 8", "district_8"] },
  { entry: { key: "district_9", label: "Quận 9" }, aliases: ["q9", "quận 9", "quan 9", "district 9", "district_9"] },
  { entry: { key: "district_10", label: "Quận 10" }, aliases: ["q10", "quận 10", "quan 10", "district 10", "district_10"] },
  { entry: { key: "district_11", label: "Quận 11" }, aliases: ["q11", "quận 11", "quan 11", "district 11", "district_11"] },
  { entry: { key: "district_12", label: "Quận 12" }, aliases: ["q12", "quận 12", "quan 12", "district 12", "district_12"] },
  {
    entry: { key: "binh_thanh", label: "Bình Thạnh" },
    aliases: ["binh thanh", "bình thạnh", "q.bình thạnh", "q binh thanh", "p.bình thạnh", "binh_thanh"]
  },
  {
    entry: { key: "tan_binh", label: "Tân Bình" },
    aliases: ["tan binh", "tân bình", "sân bay", "san bay", "lang cha ca", "tan_binh"]
  },
  {
    entry: { key: "phu_nhuan", label: "Phú Nhuận" },
    aliases: ["phu nhuan", "phú nhuận", "pnh", "phu_nhuan"]
  },
  { entry: { key: "go_vap", label: "Gò Vấp" }, aliases: ["go vap", "gò vấp", "govap", "go_vap"] },
  { entry: { key: "tan_phu", label: "Tân Phú" }, aliases: ["tan phu", "tân phú", "tan_phu"] },
  { entry: { key: "binh_tan", label: "Bình Tân" }, aliases: ["binh tan", "bình tân", "binh_tan"] },
  {
    entry: { key: "thu_duc", label: "Thủ Đức" },
    aliases: [
      "thu duc",
      "thủ đức",
      "tp thủ đức",
      "tp thu duc",
      "linh trung",
      "linh xuân",
      "linh xuan",
      "đông hòa",
      "dong hoa",
      "thu_duc",
      "đại học quốc gia",
      "dai hoc quoc gia",
      "đhqg",
      "làng đại học",
      "lang dai hoc",
      "khu làng đại học",
      "khu lang dai hoc"
    ]
  },
  { entry: { key: "hoc_mon", label: "Hóc Môn" }, aliases: ["hoc mon", "hóc môn", "hoc_mon"] },
  { entry: { key: "cu_chi", label: "Củ Chi" }, aliases: ["cu chi", "củ chi", "cu_chi"] },
  { entry: { key: "binh_chanh", label: "Bình Chánh" }, aliases: ["binh chanh", "bình chánh", "binh_chanh"] },
  { entry: { key: "nha_be", label: "Nhà Bè" }, aliases: ["nha be", "nhà bè", "nha_be"] },
  { entry: { key: "can_gio", label: "Cần Giờ" }, aliases: ["can gio", "cần giờ", "can_gio"] }
];

const cityLookup = buildLookup(CITY_ENTRIES);
const districtLookup = buildLookup(DISTRICT_ENTRIES);

const KNOWN_DISTRICT_KEYS = new Set(DISTRICT_ENTRIES.map(({ entry }) => entry.key));

export function isKnownDistrictKey(key: string): boolean {
  return KNOWN_DISTRICT_KEYS.has(key);
}

export function normalizeRegionPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function resolveCity(value: string): RegionEntry {
  return resolveRegionValue(value, cityLookup);
}

export function resolveDistrict(value: string): RegionEntry {
  return resolveRegionValue(value, districtLookup);
}

export function resolveRegionFields(cityInput: string, districtInput: string): {
  city: string;
  cityLabel: string;
  district: string;
  districtLabel: string;
} {
  const city = resolveCity(cityInput);
  const district = resolveDistrict(districtInput);

  return {
    city: city.key,
    cityLabel: city.label,
    district: district.key,
    districtLabel: district.label
  };
}

function buildLookup(entries: Array<{ entry: RegionEntry; aliases: string[] }>): Map<string, RegionEntry> {
  const lookup = new Map<string, RegionEntry>();

  for (const { entry, aliases } of entries) {
    registerAlias(lookup, entry.key, entry);
    registerAlias(lookup, entry.label, entry);
    for (const alias of aliases) {
      registerAlias(lookup, alias, entry);
    }
  }

  return lookup;
}

function registerAlias(lookup: Map<string, RegionEntry>, alias: string, entry: RegionEntry): void {
  lookup.set(normalizeLookupKey(alias), entry);
}

function normalizeLookupKey(value: string): string {
  return normalizeRegionPart(value).replace(/_/g, "");
}

function resolveRegionValue(value: string, lookup: Map<string, RegionEntry>): RegionEntry {
  const trimmed = value.trim();
  if (!trimmed) {
    return { key: "", label: "" };
  }

  const mapped = lookup.get(normalizeLookupKey(trimmed));
  if (mapped) {
    return mapped;
  }

  const numberedDistrict = parseNumberedDistrict(trimmed);
  if (numberedDistrict) {
    return numberedDistrict;
  }

  return {
    key: normalizeRegionPart(trimmed),
    label: trimmed
  };
}

function parseNumberedDistrict(value: string): RegionEntry | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/^(?:q|quan|district)\s*(\d{1,2})$/);
  if (!match) {
    return undefined;
  }

  const districtNumber = match[1]!;
  return {
    key: `district_${districtNumber}`,
    label: `Quận ${districtNumber}`
  };
}
