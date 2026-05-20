import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { RentalInfo } from "../domain/rental-info";
import { isRawRentalPost, type RawRentalPost } from "../domain/raw-rental-post";
import type { SanitizationMessage } from "../domain/sanitization-message";

export type AwsClientConfig = {
  region?: string;
  endpoint?: string;
};

export type RawPostStore = {
  get(rawPostId: string): Promise<RawRentalPost | undefined>;
  putNew(rawPost: RawRentalPost): Promise<void>;
  updateChanged(rawPost: RawRentalPost): Promise<void>;
  markCompleted(rawPostId: string, expectedContentHash: string, sanitizedCount: number, timestamp: string): Promise<void>;
  markFailed(rawPostId: string, expectedContentHash: string, processError: RawRentalPost["processError"], timestamp: string): Promise<void>;
};

export type RentalInfoStore = {
  put(rentalInfo: RentalInfo): Promise<void>;
};

export type SanitizationQueue = {
  send(message: SanitizationMessage): Promise<void>;
};

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
        ConditionExpression: "contentHash = :contentHash",
        ExpressionAttributeValues: {
          ":contentHash": expectedContentHash,
          ":status": "completed",
          ":count": sanitizedCount,
          ":updatedAt": timestamp
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
