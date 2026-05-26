import type { SQSEvent, SQSBatchResponse, SQSRecord } from "aws-lambda";

import { downloadAttachmentMessageSchema } from "../domain/schemas";
import { webReadableToNodeReadable } from "../services/attachment-stream";
import {
  createDocumentClient,
  createS3Client,
  DynamoRentalInfoStore,
  S3AttachmentMediaStore
} from "../services/aws-clients";
import { loadCrawlerConfig } from "../services/config";
import {
  DownloadAttachmentService,
  type HttpFetchResult
} from "../services/download-attachment.service";

export type DownloadAttachmentHandlerDependencies = {
  service: DownloadAttachmentService;
};

export async function runDownloadAttachmentBatch(
  event: SQSEvent,
  dependencies: DownloadAttachmentHandlerDependencies
): Promise<SQSBatchResponse> {
  console.info("download attachment started", JSON.stringify(event));
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
  return runDownloadAttachmentBatch(event, { service: createDefaultService() });
}

async function processRecord(
  record: SQSRecord,
  service: DownloadAttachmentService
): Promise<"ack" | "retry"> {
  let message;
  try {
    message = downloadAttachmentMessageSchema.parse(JSON.parse(record.body));
  } catch (error) {
    console.warn("download attachment message was invalid", {
      messageId: record.messageId,
      error: error instanceof Error ? error.name : "UnknownError"
    });
    return "ack";
  }

  try {
    const result = await service.process(message);
    if (result.outcome === "retry") {
      console.warn("download attachment will retry", { messageId: record.messageId, reason: result.reason });
      return "retry";
    }
    console.info("download attachment processed", { messageId: record.messageId, outcome: result.outcome });
    return "ack";
  } catch (error) {
    console.warn("download attachment failed before classification", {
      messageId: record.messageId,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
    return "retry";
  }
}

function createDefaultService(): DownloadAttachmentService {
  const config = loadCrawlerConfig();
  if (!config.attachmentMediaBucketName) {
    throw new Error("ATTACHMENT_MEDIA_BUCKET_NAME is required");
  }

  const awsRegion = config.awsRegion ?? "ap-southeast-1";
  const documentClient = createDocumentClient({ region: awsRegion });
  const rentalInfoStore = new DynamoRentalInfoStore(documentClient, config.rentalInfoTableName);
  const mediaStore = new S3AttachmentMediaStore(
    createS3Client({ region: awsRegion }),
    config.attachmentMediaBucketName
  );

  return new DownloadAttachmentService(rentalInfoStore, mediaStore, { fetch: fetchAttachmentStream }, {
    attachmentMediaBucketName: config.attachmentMediaBucketName,
    awsRegion
  });
}

async function fetchAttachmentStream(url: string, init?: { signal?: AbortSignal }): Promise<HttpFetchResult> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type");
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength =
    contentLengthHeader === null ? undefined : Number.parseInt(contentLengthHeader, 10);
  const parsedContentLength =
    contentLength !== undefined && Number.isFinite(contentLength) && contentLength >= 0
      ? contentLength
      : undefined;

  if (!response.ok || !response.body) {
    return {
      ok: false,
      status: response.status,
      contentType
    };
  }

  return {
    ok: true,
    status: response.status,
    contentType,
    contentLength: parsedContentLength,
    body: webReadableToNodeReadable(response.body)
  };
}
