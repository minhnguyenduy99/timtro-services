import { z } from "zod";

import { buildRegion, toRentalInfo, type RentalInfo, type RentalInfoCandidate } from "./rental-info";
import { resolveRegionFields } from "./region-mapping";
import { isValidRentalPrice, UNKNOWN_RENTAL_PRICE } from "./rent-price";

export class DomainValidationError extends Error {
  readonly category = "validation";

  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const nonEmptyString = z.string().trim().min(1);

export const rentalAttachmentSchema = z.object({
  type: z.enum(["photo", "video"]),
  url: z.string().url()
});

const rentalPriceSchema = z
  .number()
  .int()
  .refine((value) => value === UNKNOWN_RENTAL_PRICE || isValidRentalPrice(value), {
    message: "price must be -1 or a positive VND amount divisible by 1000"
  });

export const rentalInfoCandidateSchema = z.object({
  source: z.literal("fb").optional(),
  sourcePostId: nonEmptyString,
  sourceCommentId: nonEmptyString.optional(),
  address: nonEmptyString,
  city: nonEmptyString,
  district: nonEmptyString,
  title: nonEmptyString,
  description: z.string().optional(),
  price: rentalPriceSchema.optional(),
  priceUnit: z.literal("VND").optional(),
  postDate: z.string().datetime(),
  timestamp: z.string().datetime(),
  originalLink: z.string().url(),
  attachments: z.array(rentalAttachmentSchema).default([])
});

export const rentalInfoSchema = z.object({
  source: z.literal("fb"),
  region: nonEmptyString,
  id: nonEmptyString,
  sourcePostId: nonEmptyString,
  sourceCommentId: nonEmptyString.optional(),
  address: nonEmptyString,
  city: nonEmptyString,
  cityLabel: nonEmptyString,
  district: nonEmptyString,
  districtLabel: nonEmptyString,
  title: nonEmptyString,
  description: z.string(),
  price: rentalPriceSchema,
  priceUnit: z.literal("VND"),
  postDate: z.string().datetime(),
  timestamp: z.string().datetime(),
  originalLink: z.string().url(),
  attachments: z.array(rentalAttachmentSchema).default([])
});

export const sanitizationMessageSchema = z.object({
  rawPostId: nonEmptyString,
  contentHash: nonEmptyString,
  crawlRunId: nonEmptyString.optional(),
  source: z.literal("fb"),
  groupId: nonEmptyString,
  postId: nonEmptyString
});

export function validateRentalInfoCandidate(input: unknown): RentalInfo {
  const parsed = rentalInfoCandidateSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  const regionFields = resolveRegionFields(parsed.data.city, parsed.data.district);
  const region = buildRegion(regionFields.city, regionFields.district);
  if (!region.includes("_") || region.startsWith("_") || region.endsWith("_")) {
    throw new DomainValidationError("city and district are required to build a region key");
  }

  return rentalInfoSchema.parse(toRentalInfo(parsed.data satisfies RentalInfoCandidate));
}

export function validateRentalInfoCandidates(input: unknown): RentalInfo[] {
  if (!Array.isArray(input)) {
    throw new DomainValidationError("expected an array of rental info candidates");
  }
  return input.map(validateRentalInfoCandidate);
}
