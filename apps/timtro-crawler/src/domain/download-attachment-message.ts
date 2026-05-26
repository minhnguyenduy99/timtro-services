import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const downloadAttachmentMessageSchema = z.object({
  region: nonEmptyString,
  id: nonEmptyString
});

export type DownloadAttachmentMessage = z.infer<typeof downloadAttachmentMessageSchema>;

export function createDownloadAttachmentMessage(
  input: DownloadAttachmentMessage
): DownloadAttachmentMessage {
  return downloadAttachmentMessageSchema.parse(input);
}
