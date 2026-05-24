import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  type ScanCommandInput
} from "@aws-sdk/lib-dynamodb";

import { rentalInfoSchema, type RentalInfo } from "@timtro/rental-info";

export type MigrateRentalInfoOptions = {
  sourceTableName: string;
  destTableName: string;
  dryRun?: boolean;
  limit?: number;
  scanPageSize?: number;
  writeBatchSize?: number;
};

export type MigrateRentalInfoResult = {
  scanned: number;
  written: number;
  skipped: number;
};

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function parseRentalInfoItem(item: Record<string, unknown>): RentalInfo | undefined {
  const parsed = rentalInfoSchema.safeParse(item);
  return parsed.success ? parsed.data : undefined;
}

export async function migrateRentalInfoTable(
  documentClient: DynamoDBDocumentClient,
  options: MigrateRentalInfoOptions
): Promise<MigrateRentalInfoResult> {
  const scanPageSize = options.scanPageSize ?? 100;
  const writeBatchSize = Math.min(options.writeBatchSize ?? 25, 25);
  const result: MigrateRentalInfoResult = { scanned: 0, written: 0, skipped: 0 };

  let lastEvaluatedKey: ScanCommandInput["ExclusiveStartKey"];

  do {
    const remaining = options.limit === undefined ? undefined : options.limit - result.scanned;
    if (remaining !== undefined && remaining <= 0) {
      break;
    }

    const scanResult = await documentClient.send(
      new ScanCommand({
        TableName: options.sourceTableName,
        ExclusiveStartKey: lastEvaluatedKey,
        Limit: remaining === undefined ? scanPageSize : Math.min(scanPageSize, remaining)
      })
    );

    const validItems: RentalInfo[] = [];
    for (const item of scanResult.Items ?? []) {
      result.scanned += 1;
      const parsed = parseRentalInfoItem(item);
      if (parsed) {
        validItems.push(parsed);
      } else {
        result.skipped += 1;
        console.warn(`Skipping invalid row in ${options.sourceTableName}:`, item.region, item.id);
      }
    }

    if (!options.dryRun && validItems.length > 0) {
      result.written += await writeItems(documentClient, options.destTableName, validItems, writeBatchSize);
    } else if (options.dryRun) {
      result.written += validItems.length;
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return result;
}

async function writeItems(
  documentClient: DynamoDBDocumentClient,
  tableName: string,
  items: RentalInfo[],
  batchSize: number
): Promise<number> {
  let written = 0;

  for (const batch of chunk(items, batchSize)) {
    let pending = batch;

    while (pending.length > 0) {
      const response = await documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: pending.map((item) => ({ PutRequest: { Item: item } }))
          }
        })
      );

      const unprocessed = response.UnprocessedItems?.[tableName] ?? [];
      written += pending.length - unprocessed.length;
      pending = unprocessed
        .map((entry) => entry.PutRequest?.Item)
        .filter((item): item is RentalInfo => item !== undefined);

      if (pending.length > 0) {
        await sleep(200);
      }
    }
  }

  return written;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function resolveTableNames(): { sourceTableName: string; destTableName: string } {
  const environmentName = process.env.ENVIRONMENT_NAME ?? "dev";
  const sourceTableName =
    process.env.RENTAL_INFO_SOURCE_TABLE_NAME ??
    readOption("--source") ??
    `timtro-rental-info-${environmentName}`;
  const destTableName =
    process.env.RENTAL_INFO_TABLE_NAME ?? readOption("--dest") ?? `timtro-rental-info-v2-${environmentName}`;

  return { sourceTableName, destTableName };
}

async function main(): Promise<void> {
  const dryRun = readFlag("--dry-run");
  const limitValue = readOption("--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

  if (limitValue && (!Number.isFinite(limit) || limit! <= 0)) {
    throw new Error(`Invalid --limit value: ${limitValue}`);
  }

  const { sourceTableName, destTableName } = resolveTableNames();
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;

  console.log("Timtro rental info migration v1 → v2");
  console.log(`  source: ${sourceTableName}`);
  console.log(`  dest:   ${destTableName}`);
  console.log(`  dryRun: ${dryRun}`);
  if (limit !== undefined) {
    console.log(`  limit:  ${limit}`);
  }

  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient(region ? { region } : {}), {
    marshallOptions: { removeUndefinedValues: true }
  });

  const result = await migrateRentalInfoTable(documentClient, {
    sourceTableName,
    destTableName,
    dryRun,
    limit
  });

  console.log("Done.");
  console.log(`  scanned: ${result.scanned}`);
  console.log(`  written: ${result.written}${dryRun ? " (dry run)" : ""}`);
  console.log(`  skipped: ${result.skipped}`);
}

const isMain =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("migrate-rental-info-v1-to-v2.ts") ||
    process.argv[1].endsWith("migrate-rental-info-v1-to-v2.mjs"));

if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
