import type { S3Event } from "aws-lambda";

import {
  createDocumentClient,
  DynamoRentalInfoStore,
  parseAttachmentMediaKey
} from "../services/aws-clients";
import { loadCrawlerConfig } from "../services/config";
import { UpdateAttachmentMetadataService } from "../services/update-attachment-metadata.service";

export type UpdateAttachmentMetadataHandlerDependencies = {
  service: UpdateAttachmentMetadataService;
};

export async function runUpdateAttachmentMetadataBatch(
  event: S3Event,
  dependencies: UpdateAttachmentMetadataHandlerDependencies
): Promise<void> {
  console.info("attachment metadata update started", JSON.stringify(event));
  let totalFailed = 0;

  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const parsed = parseAttachmentMediaKey(key);
    if (!parsed) {
      continue;
    }

    const result = await dependencies.service.processMirroredObject(parsed, key);
    totalFailed += result.failed;
    console.info("attachment metadata updated", {
      key,
      region: parsed.region,
      listingId: parsed.id,
      attachmentIndex: parsed.index,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed
    });
  }

  if (totalFailed > 0) {
    throw new Error(`attachment metadata update failed for ${totalFailed} listing(s)`);
  }
}

export async function handler(event: S3Event): Promise<void> {
  return runUpdateAttachmentMetadataBatch(event, createDefaultDependencies());
}

function createDefaultDependencies(): UpdateAttachmentMetadataHandlerDependencies {
  const config = loadCrawlerConfig();
  if (!config.attachmentMediaBucketName) {
    throw new Error("ATTACHMENT_MEDIA_BUCKET_NAME is required");
  }

  const awsRegion = config.awsRegion ?? "ap-southeast-1";
  const documentClient = createDocumentClient({ region: awsRegion });

  return {
    service: new UpdateAttachmentMetadataService(
      new DynamoRentalInfoStore(documentClient, config.rentalInfoTableName),
      {
        bucketName: config.attachmentMediaBucketName,
        awsRegion
      }
    )
  };
}
