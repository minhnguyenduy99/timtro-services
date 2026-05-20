import { z } from "zod";

import type { RentalInfo } from "../../domain/rental-info";
import { DomainValidationError, validateRentalInfoCandidates } from "../../domain/schemas";

export const aiSanitizationSchemaVersion = "2026-05-20";

const aiRentalCandidateSchema = z.object({
  sourcePostId: z.string().min(1),
  sourceCommentId: z.string().min(1).optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  title: z.string().min(1),
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
