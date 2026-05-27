import type { Readable } from "node:stream";

import { readReadableToUint8Array } from "./attachment-stream";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import type { RentalInfo } from "@timtro/rental-info";
import type { DownloadAttachmentMessage } from "../domain/download-attachment-message";
import { isRawRentalPost, type RawRentalPost } from "../domain/raw-rental-post";
import type { SanitizationMessage } from "../domain/sanitization-message";

export type AwsClientConfig = {
  region?: string;
};

/** AWS SDK v3.729+ chunked checksum uploads require stream chunks >= 8 KiB unless buffered. */
export const S3_REQUEST_STREAM_BUFFER_SIZE = 64 * 1024;

export type RawPostStore = {
  get(rawPostId: string): Promise<RawRentalPost | undefined>;
  putNew(rawPost: RawRentalPost): Promise<void>;
  updateChanged(rawPost: RawRentalPost): Promise<void>;
  markCompleted(rawPostId: string, expectedContentHash: string, sanitizedCount: number, timestamp: string): Promise<void>;
  markFailed(rawPostId: string, expectedContentHash: string, processError: RawRentalPost["processError"], timestamp: string): Promise<void>;
};

export type RentalInfoStore = {
  put(rentalInfo: RentalInfo): Promise<void>;
  get(region: string, id: string): Promise<RentalInfo | undefined>;
  updateAttachmentUrl(region: string, id: string, attachmentIndex: number, publicUrl: string): Promise<void>;
};

export type SanitizationQueue = {
  send(message: SanitizationMessage): Promise<void>;
};

export type DownloadAttachmentQueue = {
  send(message: DownloadAttachmentMessage): Promise<void>;
};

export type S3MediaStore = {
  putObjectStream(key: string, body: Readable, contentType: string): Promise<void>;
};

export type ParsedAttachmentMediaKey = {
  region: string;
  id: string;
  index: number;
  extension: string;
};

const ATTACHMENT_MEDIA_KEY_PATTERN = /^public\/attachments\/([^/]+)\/([^/]+)\/(\d+)\.([a-z0-9]+)$/i;

export class DynamoRawPostStore implements RawPostStore {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async get(rawPostId: string): Promise<RawRentalPost | undefined> {
    const result = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { id: rawPostId }
      })
    );
    if (!result.Item) {
      return undefined;
    }
    if (!isRawRentalPost(result.Item)) {
      throw new Error(`Raw rental post ${rawPostId} is malformed`);
    }
    return result.Item;
  }

  async putNew(rawPost: RawRentalPost): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: rawPost,
        ConditionExpression: "attribute_not_exists(id)"
      })
    );
  }

  async updateChanged(rawPost: RawRentalPost): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: rawPost,
        ConditionExpression: "attribute_exists(id)"
      })
    );
  }

  async markCompleted(
    rawPostId: string,
    expectedContentHash: string,
    sanitizedCount: number,
    timestamp: string
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: rawPostId },
        UpdateExpression:
          "SET processStatus = :status, sanitizedCount = :count, updatedAt = :updatedAt REMOVE processError",
        ConditionExpression: "contentHash = :contentHash AND (processStatus = :pending OR processStatus = :fail)",
        ExpressionAttributeValues: {
          ":contentHash": expectedContentHash,
          ":status": "completed",
          ":count": sanitizedCount,
          ":updatedAt": timestamp,
          ":pending": "pending",
          ":fail": "fail"
        }
      })
    );
  }

  async markFailed(
    rawPostId: string,
    expectedContentHash: string,
    processError: RawRentalPost["processError"],
    timestamp: string
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { id: rawPostId },
        UpdateExpression: "SET processStatus = :status, processError = :error, updatedAt = :updatedAt",
        ConditionExpression: "contentHash = :contentHash",
        ExpressionAttributeValues: {
          ":contentHash": expectedContentHash,
          ":status": "fail",
          ":error": processError,
          ":updatedAt": timestamp
        }
      })
    );
  }
}

export class DynamoRentalInfoStore implements RentalInfoStore {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async put(rentalInfo: RentalInfo): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: rentalInfo
      })
    );
  }

  async get(region: string, id: string): Promise<RentalInfo | undefined> {
    const result = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { region, id }
      })
    );
    if (!result.Item) {
      return undefined;
    }
    return result.Item as RentalInfo;
  }

  async updateAttachmentUrl(
    region: string,
    id: string,
    attachmentIndex: number,
    publicUrl: string
  ): Promise<void> {
    await this.documentClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { region, id },
        UpdateExpression: `SET attachments[${attachmentIndex}].#url = :url`,
        ConditionExpression: `attribute_exists(attachments[${attachmentIndex}])`,
        ExpressionAttributeNames: {
          "#url": "url"
        },
        ExpressionAttributeValues: {
          ":url": publicUrl
        }
      })
    );
  }
}

export class SqsDownloadAttachmentQueue implements DownloadAttachmentQueue {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string
  ) {}

  async send(message: DownloadAttachmentMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message)
      })
    );
  }
}

export class S3AttachmentMediaStore implements S3MediaStore {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string
  ) {}

  async putObjectStream(key: string, body: Readable, contentType: string): Promise<void> {
    const bytes = await readReadableToUint8Array(body);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
        ContentType: contentType,
        ContentDisposition: "inline"
      })
    );
  }
}

export class SqsSanitizationQueue implements SanitizationQueue {
  constructor(
    private readonly sqsClient: SQSClient,
    private readonly queueUrl: string
  ) {}

  async send(message: SanitizationMessage): Promise<void> {
    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message)
      })
    );
  }
}

export function createDocumentClient(config: AwsClientConfig = {}): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient(config), {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
}

export function createSqsClient(config: AwsClientConfig = {}): SQSClient {
  return new SQSClient(config);
}

export function createS3Client(config: AwsClientConfig = {}): S3Client {
  return new S3Client({
    ...config,
    requestStreamBufferSize: S3_REQUEST_STREAM_BUFFER_SIZE
  });
}

export function buildPublicS3Url(bucketName: string, awsRegion: string, key: string): string {
  return `https://${bucketName}.s3.${awsRegion}.amazonaws.com/${key}`;
}

export function buildAttachmentMediaKey(
  region: string,
  listingId: string,
  index: number,
  extension: string
): string {
  return `public/attachments/${region}/${listingId}/${index}.${extension}`;
}

export function parseAttachmentMediaKey(key: string): ParsedAttachmentMediaKey | undefined {
  const match = key.match(ATTACHMENT_MEDIA_KEY_PATTERN);
  if (!match?.[1] || !match[2] || match[3] === undefined || !match[4]) {
    return undefined;
  }

  return {
    region: match[1],
    id: match[2],
    index: Number.parseInt(match[3], 10),
    extension: match[4].toLowerCase()
  };
}

export function isMirroredAttachmentUrl(url: string, bucketName: string, awsRegion: string): boolean {
  const host = `${bucketName}.s3.${awsRegion}.amazonaws.com`;
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
}
