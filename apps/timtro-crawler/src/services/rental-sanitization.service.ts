import { DomainValidationError } from "../domain/schemas";
import type { SanitizationMessage } from "../domain/sanitization-message";
import { AiProviderError, type AiSanitizerProvider } from "../providers/ai/ai-sanitizer.provider";
import type { RawPostStore, RentalInfoStore } from "./aws-clients";

export type SanitizationProcessResult =
  | { outcome: "completed"; sanitizedCount: number }
  | { outcome: "skipped"; reason: "already_completed" | "stale_message" | "missing_raw_post" }
  | { outcome: "retry"; reason: string }
  | { outcome: "failed"; reason: string };

export class RentalSanitizationService {
  constructor(
    private readonly rawStore: RawPostStore,
    private readonly rentalInfoStore: RentalInfoStore,
    private readonly provider: AiSanitizerProvider
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
