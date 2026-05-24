import { z } from "zod";

export {
  DomainValidationError,
  rentalAttachmentSchema,
  rentalInfoCandidateSchema,
  rentalInfoSchema,
  validateRentalInfoCandidate,
  validateRentalInfoCandidates
} from "@timtro/rental-info";

const nonEmptyString = z.string().trim().min(1);

export const sanitizationMessageSchema = z.object({
  rawPostId: nonEmptyString,
  contentHash: nonEmptyString,
  crawlRunId: nonEmptyString.optional(),
  source: z.literal("fb"),
  groupId: nonEmptyString,
  postId: nonEmptyString
});
