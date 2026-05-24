export {
  buildRegion,
  buildRentalInfoId,
  normalizeRegionPart,
  toRentalInfo,
  type RentalAttachment,
  type RentalInfo,
  type RentalInfoCandidate
} from "./rental-info";

export {
  isKnownDistrictKey,
  resolveCity,
  resolveDistrict,
  resolveRegionFields,
  type RegionEntry
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

export { resolveAreaQueryToRegions } from "./area-query";
