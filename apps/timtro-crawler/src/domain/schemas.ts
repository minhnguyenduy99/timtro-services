import { z } from "zod";

import { buildRegion, toRentalInfo, type RentalInfo, type RentalInfoCandidate } from "./rental-info";

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

export const rentalInfoCandidateSchema = z.object({
  source: z.literal("fb").optional(),
  sourcePostId: nonEmptyString,
  sourceCommentId: nonEmptyString.optional(),
  address: nonEmptyString,
  city: nonEmptyString,
  district: nonEmptyString,
  title: nonEmptyString,
  postDate: z.string().datetime(),
  timestamp: z.string().datetime(),
  originalLink: z.string().url(),
  attachments: z.array(rentalAttachmentSchema).default([])
});

export const rentalInfoSchema = rentalInfoCandidateSchema.extend({
  source: z.literal("fb"),
  region: nonEmptyString,
  id: nonEmptyString
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

  const region = buildRegion(parsed.data.city, parsed.data.district);
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
