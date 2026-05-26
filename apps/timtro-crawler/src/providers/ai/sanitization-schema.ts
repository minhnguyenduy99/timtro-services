import { z } from "zod";

import { buildSourcePostId, resolveRentalPrice, type RentalInfo } from "@timtro/rental-info";

import type { RawRentalPost } from "../../domain/raw-rental-post";
import { DomainValidationError, validateRentalInfoCandidates } from "../../domain/schemas";

export const aiSanitizationSchemaVersion = "2026-05-20";

const aiRentalCandidateSchema = z.object({
  sourcePostId: z.string().min(1),
  sourceCommentId: z.string().min(1).optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().optional(),
  postDate: z.string().datetime(),
  timestamp: z.string().datetime(),
  originalLink: z.string().url(),
  attachments: z
    .array(
      z.object({
        type: z.enum(["photo", "video"]),
        url: z.string().url()
      })
    )
    .default([])
});

export const aiSanitizationResponseSchema = z.discriminatedUnion("classification", [
  z.object({
    classification: z.literal("rental"),
    rentals: z.array(aiRentalCandidateSchema).min(1)
  }),
  z.object({
    classification: z.literal("non_rental"),
    rentals: z.array(aiRentalCandidateSchema).max(0).default([])
  })
]);

export type ParsedAiSanitizationResponse =
  | { classification: "rental"; records: RentalInfo[] }
  | { classification: "non_rental"; records: [] };

export function normalizeAiSanitizationResponse(rawPost: RawRentalPost, input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.rentals)) {
    return input;
  }

  return {
    ...input,
    rentals: input.rentals.map((rental) => normalizeRentalCandidate(rawPost, rental))
  };
}

export function parseAiSanitizationResponse(input: unknown): ParsedAiSanitizationResponse {
  const parsed = aiSanitizationResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }

  if (parsed.data.classification === "non_rental") {
    return { classification: "non_rental", records: [] };
  }

  return {
    classification: "rental",
    records: validateRentalInfoCandidates(parsed.data.rentals)
  };
}

function normalizeRentalCandidate(rawPost: RawRentalPost, rental: unknown): unknown {
  if (!isRecord(rental)) {
    return rental;
  }

  return {
    ...rental,
    sourcePostId: buildSourcePostId(rawPost.postId),
    postDate: coerceDateTimeString(rental.postDate, rawPost.postedAt),
    timestamp: resolveRentalTimestamp(rawPost, rental),
    originalLink: firstNonEmptyString(rental.originalLink, rawPost.url),
    attachments: rawPost.attachments,
    description: rawPost.text ?? "",
    ...normalizePriceFields(rental, rawPost)
  };
}

function normalizePriceFields(
  rental: Record<string, unknown>,
  rawPost: RawRentalPost
): { price: number; priceUnit: "VND" } {
  const text = [typeof rental.title === "string" ? rental.title : undefined, rawPost.text]
    .filter(Boolean)
    .join("\n");

  return resolveRentalPrice({
    aiPrice: rental.price ?? rental.priceVnd ?? rental.monthlyRentVnd,
    text
  });
}

function resolveRentalTimestamp(rawPost: RawRentalPost, rental: Record<string, unknown>): string | undefined {
  const sourceCommentId =
    typeof rental.sourceCommentId === "string" && rental.sourceCommentId.trim().length > 0
      ? rental.sourceCommentId.trim()
      : undefined;

  if (sourceCommentId) {
    const comment = rawPost.comments.find((candidate) => candidate.commentId === sourceCommentId);
    return coerceDateTimeString(comment?.timestamp, rawPost.postedAt ?? rawPost.updatedAt);
  }

  return coerceDateTimeString(undefined, rawPost.postedAt ?? rawPost.updatedAt);
}

function coerceDateTimeString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
    return value.trim();
  }

  return fallback;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
