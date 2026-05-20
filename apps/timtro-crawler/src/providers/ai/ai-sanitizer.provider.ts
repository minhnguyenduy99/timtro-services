import type { RentalInfo } from "../../domain/rental-info";
import type { RawRentalPost } from "../../domain/raw-rental-post";

export type AiProviderMetadata = {
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
};

export type AiSanitizationResult =
  | {
      kind: "rental_info";
      records: RentalInfo[];
      metadata: AiProviderMetadata;
    }
  | {
      kind: "non_rental";
      records: [];
      metadata: AiProviderMetadata;
    };

export type ProviderErrorKind = "retryable" | "validation" | "configuration";

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly metadata: AiProviderMetadata
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export type AiSanitizerProvider = {
  sanitize(rawPost: RawRentalPost): Promise<AiSanitizationResult>;
};

export class FakeAiSanitizerProvider implements AiSanitizerProvider {
  constructor(private readonly result: AiSanitizationResult) {}

  async sanitize(): Promise<AiSanitizationResult> {
    return this.result;
  }
}
