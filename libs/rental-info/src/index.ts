export {
  buildRegion,
  buildRentalInfoId,
  buildSourcePostId,
  normalizeRegionPart,
  toRentalInfo,
  type RentalAttachment,
  type RentalInfo,
  type RentalInfoCandidate
} from "./rental-info";

export {
  isKnownCityKey,
  isKnownDistrictKey,
  listSupportedAreas,
  resolveCity,
  resolveDistrict,
  resolveRegionFields,
  type RegionEntry,
  type SupportedAreaCity
} from "./region-mapping";

export {
  coercePrice,
  isValidRentalPrice,
  parseMonthlyRentVnd,
  resolveRentalPrice,
  UNKNOWN_RENTAL_PRICE,
  type ParsedMonthlyRent
} from "./rent-price";

export {
  DomainValidationError,
  rentalAttachmentSchema,
  rentalInfoCandidateSchema,
  rentalInfoSchema,
  validateRentalInfoCandidate,
  validateRentalInfoCandidates
} from "./schemas";

export { resolveCityDistrictsToRegions } from "./area-query";
