import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { rentalInfoSchema, type RentalInfo } from "@timtro/rental-info";

export type RentalInfoRepository = {
  queryByRegion(region: string, options?: { limit?: number }): Promise<RentalInfo[]>;
};

export class DynamoRentalInfoRepository implements RentalInfoRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async queryByRegion(region: string, options: { limit?: number } = {}): Promise<RentalInfo[]> {
    const limit = options.limit;
    const items: RentalInfo[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.documentClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "#region = :region",
          ExpressionAttributeNames: { "#region": "region" },
          ExpressionAttributeValues: { ":region": region },
          ExclusiveStartKey: lastEvaluatedKey,
          ...(limit !== undefined ? { Limit: Math.max(limit - items.length, 1) } : {})
        })
      );

      for (const item of result.Items ?? []) {
        const parsed = rentalInfoSchema.safeParse(item);
        if (parsed.success) {
          items.push(parsed.data);
        } else if (process.env.NODE_ENV !== "production") {
          console.warn(`Skipping invalid rental info row in ${region}:`, parsed.error.message);
        }

        if (limit !== undefined && items.length >= limit) {
          return items;
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey && (limit === undefined || items.length < limit));

    return items;
  }
}

export function createDocumentClient(config: { region?: string } = {}): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient(config), {
    marshallOptions: {
      removeUndefinedValues: true
    }
  });
}

export function createRentalInfoRepository(): DynamoRentalInfoRepository {
  const tableName = process.env.RENTAL_INFO_TABLE_NAME;
  if (!tableName) {
    throw new Error("RENTAL_INFO_TABLE_NAME environment variable is required");
  }

  return new DynamoRentalInfoRepository(createDocumentClient(), tableName);
}
