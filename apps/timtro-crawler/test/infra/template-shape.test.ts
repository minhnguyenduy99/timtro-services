import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../../template.yaml", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../../../.github/workflows/timtro-crawler.yml", import.meta.url), "utf8");
const crawlEvent = JSON.parse(readFileSync(new URL("../../events/crawl-schedule.json", import.meta.url), "utf8"));
const sanitizeEvent = JSON.parse(readFileSync(new URL("../../events/sanitize-sqs.json", import.meta.url), "utf8"));

describe("SAM template shape", () => {
  it("defines the scheduled crawl, sanitizer, tables, queue, and DLQ", () => {
    expect(template).toContain("Runtime: nodejs24.x");
    expect(template).toContain("CrawlFunction:");
    expect(template).toContain("Type: ScheduleV2");
    expect(template).toContain("ScheduleExpression: rate(30 minutes)");
    expect(template).toContain("SanitizeFunction:");
    expect(template).toContain("RawRentalPostsTable:");
    expect(template).toContain("RentalInfoTable:");
    expect(template).toContain("SanitizationQueue:");
    expect(template).toContain("SanitizationDeadLetterQueue:");
  });

  it("uses partial batch failure reporting for SQS sanitization", () => {
    expect(template).toContain("FunctionResponseTypes:");
    expect(template).toContain("ReportBatchItemFailures");
  });

  it("names tables and queues from stack resources, not deploy parameters", () => {
    expect(template).not.toContain("RawRentalPostsTableName:");
    expect(template).not.toContain("RentalInfoTableName:");
    expect(template).not.toContain("SanitizationQueueName:");
    expect(template).toContain('TableName: !Sub "timtro-raw-rental-posts-${EnvironmentName}"');
    expect(template).toContain('TableName: !Sub "timtro-rental-info-${EnvironmentName}"');
    expect(template).toContain('QueueName: !Sub "timtro-sanitization-${EnvironmentName}"');
    expect(template).toContain("RAW_RENTAL_POSTS_TABLE_NAME: !Ref RawRentalPostsTable");
    expect(template).toContain("RENTAL_INFO_TABLE_NAME: !Ref RentalInfoTable");
    expect(template).toContain("SANITIZATION_QUEUE_URL: !Ref SanitizationQueue");
  });

  it("parameterizes provider and environment config", () => {
    for (const parameter of [
      "ApifyActorId",
      "FacebookGroupUrls",
      "ApifyToken",
      "GeminiApiKey",
      "GeminiModel",
      "GeminiDataProcessingApproved"
    ]) {
      expect(template).toContain(`${parameter}:`);
    }
  });

  it("shares lambda environment variables through Globals", () => {
    for (const envVar of [
      "ENVIRONMENT_NAME",
      "RAW_RENTAL_POSTS_TABLE_NAME",
      "RENTAL_INFO_TABLE_NAME",
      "SANITIZATION_QUEUE_URL",
      "APIFY_ACTOR_ID",
      "FACEBOOK_GROUP_URLS",
      "APIFY_TOKEN",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
      "GEMINI_DATA_PROCESSING_APPROVED",
      "LOG_LEVEL",
      "TIMTRO_USE_FAKE_PROVIDERS"
    ]) {
      expect(template).toContain(`${envVar}:`);
    }

    expect(template).not.toMatch(/CrawlFunction:[\s\S]*?Environment:/);
    expect(template).not.toMatch(/SanitizeFunction:[\s\S]*?Environment:/);
  });

  it("uses prebuilt Vite handler bundles in dist instead of SAM esbuild", () => {
    expect(template).toContain("Handler: crawl.handler");
    expect(template).toContain("Handler: sanitize.handler");
    expect(template).toContain("CodeUri: dist/");
    expect(template).toContain("SkipBuild: true");
    expect(template).not.toContain("BuildMethod:");
  });

  it("does not grant Secrets Manager access", () => {
    expect(template).not.toContain("secretsmanager:");
    expect(template).not.toContain("Resource: \"*\"");
    expect(template).not.toContain("Resource: '*'");
    expect(template).toContain("RetentionInDays: 30");
  });
});

describe("CI and local event fixtures", () => {
  it("runs crawler-scoped Nx commands in CI", () => {
    expect(workflow).toContain("pnpm nx test timtro-crawler");
    expect(workflow).toContain("pnpm nx build timtro-crawler");
    expect(workflow).not.toContain("sam build");
    expect(workflow).toContain("--config-env prod");
    expect(workflow).toContain("configure-aws-credentials");
    expect(workflow).toContain("GEMINI_DATA_PROCESSING_APPROVED");
    expect(workflow).toContain("APIFY_TOKEN");
    expect(workflow).toContain("GEMINI_API_KEY");
  });

  it("provides local fixtures matching scheduler and SQS handler shapes", () => {
    expect(crawlEvent.source).toBe("aws.scheduler");
    expect(sanitizeEvent.Records[0].eventSource).toBe("aws:sqs");
    expect(JSON.parse(sanitizeEvent.Records[0].body)).toMatchObject({
      rawPostId: "fb_2573980229535866_4680536685546866",
      source: "fb"
    });
  });
});
