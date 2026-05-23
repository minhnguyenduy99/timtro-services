import type { ScheduledEvent } from "aws-lambda";

import { ApifyCrawlerService } from "../services/apify-crawler.service";
import {
  createDocumentClient,
  createSqsClient,
  DynamoRawPostStore,
  SqsSanitizationQueue
} from "../services/aws-clients";
import { loadCrawlerConfig } from "../services/config";
import { RawPostIngestionService } from "../services/raw-post-ingestion.service";
import { ApifyClientProvider, FakeApifyCrawlerProvider, type ApifyCrawlerProvider } from "../providers/apify-client.provider";

export type CrawlHandlerDependencies = {
  crawler: ApifyCrawlerService;
  ingestion: RawPostIngestionService;
};

export async function runCrawl(dependencies: CrawlHandlerDependencies): Promise<{
  crawlRunId: string;
  fetched: number;
  stored: number;
  changed: number;
  unchanged: number;
  enqueued: number;
}> {
  const config = loadCrawlerConfig();
  const crawl = await dependencies.crawler.crawl({
    actorId: config.apifyActorId,
    groupUrls: config.facebookGroupUrls
  });
  const ingestion = await dependencies.ingestion.ingest(crawl.posts, crawl.crawlRunId);

  return {
    crawlRunId: crawl.crawlRunId,
    fetched: crawl.posts.length,
    ...ingestion
  };
}

export async function handler(_event: ScheduledEvent): Promise<{ statusCode: number; body: string }> {
  const dependencies = await createDefaultDependencies();
  const result = await runCrawl(dependencies);
  console.info("crawl completed", {
    crawlRunId: result.crawlRunId,
    fetched: result.fetched,
    stored: result.stored,
    changed: result.changed,
    unchanged: result.unchanged,
    enqueued: result.enqueued
  });
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
}

async function createDefaultDependencies(): Promise<CrawlHandlerDependencies> {
  const config = loadCrawlerConfig();
  const documentClient = createDocumentClient({ region: config.awsRegion });
  const sqsClient = createSqsClient({ region: config.awsRegion });
  const rawStore = new DynamoRawPostStore(documentClient, config.rawRentalPostsTableName);
  const queue = new SqsSanitizationQueue(sqsClient, config.sanitizationQueueUrl);
  const provider = createApifyProvider(config);

  return {
    crawler: new ApifyCrawlerService(provider),
    ingestion: new RawPostIngestionService(rawStore, queue, {
      enqueueSanitization: config.enqueueSanitization
    })
  };
}

function createApifyProvider(config: ReturnType<typeof loadCrawlerConfig>): ApifyCrawlerProvider {
  if (config.useFakeProviders) {
    return new FakeApifyCrawlerProvider();
  }
  if (!config.apifyToken) {
    throw new Error("APIFY_TOKEN is required when fake providers are disabled");
  }
  return new ApifyClientProvider(config.apifyToken);
}
