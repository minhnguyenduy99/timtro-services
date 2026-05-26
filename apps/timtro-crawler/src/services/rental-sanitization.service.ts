import { DomainValidationError } from "../domain/schemas";
import type { SanitizationMessage } from "../domain/sanitization-message";
import { AiProviderError, type AiSanitizerProvider } from "../providers/ai/ai-sanitizer.provider";
import { createDownloadAttachmentMessage } from "../domain/download-attachment-message";
import type { DownloadAttachmentQueue, RawPostStore, RentalInfoStore } from "./aws-clients";

export type SanitizationProcessResult =
  | { outcome: "completed"; sanitizedCount: number }
  | { outcome: "skipped"; reason: "already_completed" | "stale_message" | "missing_raw_post" }
  | { outcome: "retry"; reason: string }
  | { outcome: "failed"; reason: string };

export type RentalSanitizationOptions = {
  enqueueDownloadAttachment?: boolean;
};

export class RentalSanitizationService {
  constructor(
    private readonly rawStore: RawPostStore,
    private readonly rentalInfoStore: RentalInfoStore,
    private readonly provider: AiSanitizerProvider,
    private readonly downloadAttachmentQueue?: DownloadAttachmentQueue,
    private readonly options: RentalSanitizationOptions = {}
  ) {}

  async process(message: SanitizationMessage, now = new Date()): Promise<SanitizationProcessResult> {
    const rawPost = await this.rawStore.get(message.rawPostId);
    if (!rawPost) {
      return { outcome: "skipped", reason: "missing_raw_post" };
    }
    if (rawPost.contentHash !== message.contentHash) {
      return { outcome: "skipped", reason: "stale_message" };
    }
    if (rawPost.processStatus === "completed") {
      return { outcome: "skipped", reason: "already_completed" };
    }

    try {
      const result = await this.provider.sanitize(rawPost);

      if (result.kind === "non_rental") {
        await this.rawStore.markCompleted(rawPost.id, rawPost.contentHash, 0, now.toISOString());
        return { outcome: "completed", sanitizedCount: 0 };
      }

      for (const record of result.records) {
        await this.rentalInfoStore.put(record);
      }

      await this.enqueueDownloadAttachment(result.records);

      await this.rawStore.markCompleted(
        rawPost.id,
        rawPost.contentHash,
        result.records.length,
        now.toISOString()
      );
      return { outcome: "completed", sanitizedCount: result.records.length };
    } catch (error) {
      if (error instanceof AiProviderError && error.kind === "retryable") {
        return { outcome: "retry", reason: error.message };
      }

      if (error instanceof AiProviderError || error instanceof DomainValidationError) {
        await this.rawStore.markFailed(
          rawPost.id,
          rawPost.contentHash,
          {
            category: error instanceof AiProviderError ? error.kind : error.category,
            message: redactFailureMessage(error),
            provider: error instanceof AiProviderError ? error.metadata.provider : undefined,
            retryable: false,
            timestamp: now.toISOString()
          },
          now.toISOString()
        );
        return { outcome: "failed", reason: error.message };
      }

      return { outcome: "retry", reason: redactFailureMessage(error) };
    }
  }

  private async enqueueDownloadAttachment(
    records: Array<{ region: string; id: string; sourcePostId: string; attachments: Array<{ url: string }> }>
  ): Promise<void> {
    if (!this.downloadAttachmentQueue || this.options.enqueueDownloadAttachment === false) {
      return;
    }

    const enqueuedSourcePostIds = new Set<string>();

    for (const record of records) {
      if (record.attachments.length === 0 || enqueuedSourcePostIds.has(record.sourcePostId)) {
        continue;
      }
      enqueuedSourcePostIds.add(record.sourcePostId);

      try {
        await this.downloadAttachmentQueue.send(
          createDownloadAttachmentMessage({
            region: record.region,
            id: record.id
          })
        );
      } catch (error) {
        console.warn("download attachment enqueue failed", {
          region: record.region,
          listingId: record.id,
          sourcePostId: record.sourcePostId,
          error: error instanceof Error ? error.name : "UnknownError"
        });
      }
    }
  }
}

function redactFailureMessage(error: unknown): string {
  if (error instanceof AiProviderError) {
    return error.kind;
  }
  if (error instanceof DomainValidationError) {
    return error.category;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return "UnknownError";
}
