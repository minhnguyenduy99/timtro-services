import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

import { rentalInfoSchema, type RentalInfo } from "@timtro/rental-info";

export type SortField = "date" | "price";
export type SortOrder = "asc" | "desc";

export type RentalInfoQueryOptions = {
  limit?: number;
  sort?: { field: SortField; order: SortOrder };
  dateRangeCutoff?: string;
};

export type RentalInfoRepository = {
  queryByRegion(region: string, options?: RentalInfoQueryOptions): Promise<RentalInfo[]>;
};

type QueryPlan = {
  indexName: "byPostDate" | "byPrice";
  scanIndexForward: boolean;
  keyConditionExpression: string;
  expressionAttributeNames: Record<string, string>;
  expressionAttributeValues: Record<string, unknown>;
};

export class DynamoRentalInfoRepository implements RentalInfoRepository {
  constructor(
    private readonly documentClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  async queryByRegion(region: string, options: RentalInfoQueryOptions = {}): Promise<RentalInfo[]> {
    const limit = options.limit;
    const plan = buildQueryPlan(options);
    const items: RentalInfo[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.documentClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: plan.indexName,
          KeyConditionExpression: plan.keyConditionExpression,
          ExpressionAttributeNames: plan.expressionAttributeNames,
          ExpressionAttributeValues: {
            ":region": region,
            ...plan.expressionAttributeValues
          },
          ScanIndexForward: plan.scanIndexForward,
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

function buildQueryPlan(options: RentalInfoQueryOptions): QueryPlan {
  const sort = options.sort ?? { field: "date", order: "desc" };
  const expressionAttributeNames: Record<string, string> = { "#region": "region" };
  const expressionAttributeValues: Record<string, unknown> = {};

  if (sort.field === "price") {
    expressionAttributeNames["#price"] = "price";
    expressionAttributeValues[":zero"] = 0;

    return {
      indexName: "byPrice",
      scanIndexForward: sort.order === "asc",
      keyConditionExpression: "#region = :region AND #price > :zero",
      expressionAttributeNames,
      expressionAttributeValues
    };
  }

  if (options.dateRangeCutoff) {
    expressionAttributeNames["#postDate"] = "postDate";
    expressionAttributeValues[":cutoff"] = options.dateRangeCutoff;

    return {
      indexName: "byPostDate",
      scanIndexForward: sort.order === "asc",
      keyConditionExpression: "#region = :region AND #postDate >= :cutoff",
      expressionAttributeNames,
      expressionAttributeValues
    };
  }

  return {
    indexName: "byPostDate",
    scanIndexForward: sort.order === "asc",
    keyConditionExpression: "#region = :region",
    expressionAttributeNames,
    expressionAttributeValues
  };
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
