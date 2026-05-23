import type { SQSEvent, SQSBatchResponse, SQSRecord } from "aws-lambda";

import { sanitizationMessageSchema } from "../domain/schemas";
import { FakeAiSanitizerProvider } from "../providers/ai/ai-sanitizer.provider";
import { GeminiSanitizerProvider } from "../providers/ai/gemini-sanitizer.provider";
import { createDocumentClient, DynamoRawPostStore, DynamoRentalInfoStore } from "../services/aws-clients";
import { loadCrawlerConfig } from "../services/config";
import { RentalSanitizationService } from "../services/rental-sanitization.service";

export type SanitizeHandlerDependencies = {
  service: RentalSanitizationService;
};

export async function runSanitizeBatch(
  event: SQSEvent,
  dependencies: SanitizeHandlerDependencies
): Promise<SQSBatchResponse> {
  const batchItemFailures = [];

  for (const record of event.Records) {
    const result = await processRecord(record, dependencies.service);
    if (result === "retry") {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  return runSanitizeBatch(event, { service: createDefaultService() });
}

async function processRecord(record: SQSRecord, service: RentalSanitizationService): Promise<"ack" | "retry"> {
  let message;
  try {
    message = sanitizationMessageSchema.parse(JSON.parse(record.body));
  } catch (error) {
    console.warn("sanitization message was invalid", {
      messageId: record.messageId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return "retry";
  }

  try {
    const result = await service.process(message);
    if (result.outcome === "retry") {
      console.warn("sanitization will retry", { messageId: record.messageId, reason: result.reason });
      return "retry";
    }
    console.info("sanitization processed", { messageId: record.messageId, outcome: result.outcome });
    return "ack";
  } catch (error) {
    console.warn("sanitization failed before classification", {
      messageId: record.messageId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return "retry";
  }
}

function createDefaultService(): RentalSanitizationService {
  const config = loadCrawlerConfig();
  const documentClient = createDocumentClient({ region: config.awsRegion });
  const rawStore = new DynamoRawPostStore(documentClient, config.rawRentalPostsTableName);
  const rentalInfoStore = new DynamoRentalInfoStore(documentClient, config.rentalInfoTableName);

  if (config.useFakeProviders) {
    return new RentalSanitizationService(
      rawStore,
      rentalInfoStore,
      new FakeAiSanitizerProvider({
        kind: "non_rental",
        records: [],
        metadata: {
          provider: "fake",
          model: "fake",
          promptVersion: "local",
          schemaVersion: "local"
        }
      })
    );
  }

  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is required when fake providers are disabled");
  }

  return new RentalSanitizationService(
    rawStore,
    rentalInfoStore,
    new GeminiSanitizerProvider({
      apiKey: config.geminiApiKey,
      model: config.geminiModel
    })
  );
}
