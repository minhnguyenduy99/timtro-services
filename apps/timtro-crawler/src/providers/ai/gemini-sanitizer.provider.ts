import { GoogleGenAI } from "@google/genai";

import type { RawRentalPost } from "../../domain/raw-rental-post";
import { DomainValidationError } from "../../domain/schemas";
import { AiProviderError, type AiProviderMetadata, type AiSanitizationResult, type AiSanitizerProvider } from "./ai-sanitizer.provider";
import { aiSanitizationSchemaVersion, parseAiSanitizationResponse } from "./sanitization-schema";

export type GeminiClientLike = {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }): Promise<unknown>;
  };
};

export type GeminiSanitizerOptions = {
  apiKey: string;
  model: string;
  promptVersion?: string;
  client?: GeminiClientLike;
};

export class GeminiSanitizerProvider implements AiSanitizerProvider {
  private readonly metadata: AiProviderMetadata;
  private readonly client: GeminiClientLike;

  constructor(private readonly options: GeminiSanitizerOptions) {
    if (!options.apiKey || !options.model) {
      throw new AiProviderError("Gemini api key and model are required", "configuration", {
        provider: "gemini",
        model: options.model,
        promptVersion: options.promptVersion ?? "v1",
        schemaVersion: aiSanitizationSchemaVersion
      });
    }

    this.metadata = {
      provider: "gemini",
      model: options.model,
      promptVersion: options.promptVersion ?? "v1",
      schemaVersion: aiSanitizationSchemaVersion
    };
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
  }

  async sanitize(rawPost: RawRentalPost): Promise<AiSanitizationResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.options.model,
        contents: buildPrompt(rawPost),
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      const parsed = parseAiSanitizationResponse(JSON.parse(readResponseText(response)));
      if (parsed.classification === "non_rental") {
        return { kind: "non_rental", records: [], metadata: this.metadata };
      }
      return { kind: "rental_info", records: parsed.records, metadata: this.metadata };
    } catch (error) {
      if (error instanceof AiProviderError) {
        throw error;
      }
      if (error instanceof DomainValidationError || error instanceof SyntaxError) {
        throw new AiProviderError(error.message, "validation", this.metadata);
      }
      throw new AiProviderError(toRedactedErrorMessage(error), "retryable", this.metadata);
    }
  }
}

function buildPrompt(rawPost: RawRentalPost): string {
  const payload = {
    sourcePostId: rawPost.postId,
    originalLink: redactUrl(rawPost.url),
    postDate: rawPost.postedAt,
    text: rawPost.text,
    attachments: rawPost.attachments.map((attachment) => ({ ...attachment, url: redactUrl(attachment.url) })),
    comments: rawPost.comments.map((comment) => ({
      sourceCommentId: comment.commentId,
      text: comment.text,
      originalLink: redactUrl(comment.url),
      timestamp: comment.timestamp
    }))
  };

  return [
    "Extract Vietnamese rental listing information from this Facebook post evidence.",
    "Return JSON only with classification=rental and rentals[], or classification=non_rental and rentals=[].",
    "Each rental must include address, city, district, title, postDate, timestamp, originalLink, and attachments.",
    JSON.stringify(payload)
  ].join("\n");
}

function redactUrl(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function readResponseText(response: unknown): string {
  if (typeof response === "object" && response !== null && "text" in response) {
    const value = (response as { text: unknown }).text;
    if (typeof value === "function") {
      return String(value.call(response));
    }
    if (typeof value === "string") {
      return value;
    }
  }
  throw new Error("Gemini response did not include text");
}

function toRedactedErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return "Unknown provider failure";
}
