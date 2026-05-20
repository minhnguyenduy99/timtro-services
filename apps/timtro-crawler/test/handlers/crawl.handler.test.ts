import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApifyCrawlerService } from "../../src/services/apify-crawler.service";
import { RawPostIngestionService } from "../../src/services/raw-post-ingestion.service";
import { runCrawl } from "../../src/handlers/crawl.handler";

const originalEnv = process.env;

describe("crawl handler orchestration", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RAW_RENTAL_POSTS_TABLE_NAME: "raw",
      RENTAL_INFO_TABLE_NAME: "info",
      SANITIZATION_QUEUE_URL: "queue",
      APIFY_ACTOR_ID: "actor",
      FACEBOOK_GROUP_URLS: "https://facebook.com/groups/one,https://facebook.com/groups/two",
      APIFY_TOKEN: "apify-token",
      GEMINI_API_KEY: "gemini-api-key"
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("crawls configured groups and returns zero-count success for empty datasets", async () => {
    const crawler = new ApifyCrawlerService({
      getActorMetadata: async (actorId) => ({ id: actorId }),
      runFacebookGroupActor: async () => ({ runId: "empty-run", items: [] })
    });
    const ingestion = {
      ingest: async () => ({ stored: 0, changed: 0, unchanged: 0, enqueued: 0 })
    } as unknown as RawPostIngestionService;

    await expect(runCrawl({ crawler, ingestion })).resolves.toEqual({
      crawlRunId: "empty-run",
      fetched: 0,
      stored: 0,
      changed: 0,
      unchanged: 0,
      enqueued: 0
    });
  });
});
