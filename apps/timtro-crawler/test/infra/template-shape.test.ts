import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync(new URL("../../template.yaml", import.meta.url), "utf8");
const workflowPath = new URL("../../../../.github/workflows/timtro-crawler.yml", import.meta.url);
const crawlEvent = JSON.parse(readFileSync(new URL("../../events/crawl-schedule.json", import.meta.url), "utf8"));
const sanitizeEvent = JSON.parse(readFileSync(new URL("../../events/sanitize-sqs.json", import.meta.url), "utf8"));

describe("SAM template shape", () => {
  it("defines the scheduled crawl, sanitizer, tables, queue, and DLQ", () => {
    expect(template).toContain("Runtime: nodejs24.x");
    expect(template).toContain("CrawlFunction:");
    expect(template).toContain("Type: ScheduleV2");
    expect(template).toContain("ScheduleExpression: cron(0 0 * * ? *)");
    expect(template).toContain("ScheduleExpressionTimezone: Asia/Ho_Chi_Minh");
    expect(template).not.toContain("rate(30 minutes)");
    expect(template).toMatch(/CrawlFunction:[\s\S]*?Timeout: 900/);
    expect(template).toContain("SanitizeFunction:");
    expect(template).toContain("RawRentalPostsTable:");
    expect(template).toContain("RentalInfoTable:");
    expect(template).toContain("RentalInfoTableV2:");
    expect(template).toContain("byPostDate");
    expect(template).toContain("byPrice");
    expect(template).toContain("SanitizationQueue:");
    expect(template).toContain("SanitizationDeadLetterQueue:");
    expect(template).toContain("AttachmentMediaBucket:");
    expect(template).toContain("DownloadAttachmentQueue:");
    expect(template).toContain("DownloadAttachmentFunction:");
    expect(template).toContain("UpdateAttachmentMetadataFunction:");
  });

  it("defines attachment mirror infrastructure without a download DLQ", () => {
    expect(template).not.toContain("DownloadAttachmentDeadLetterQueue:");
    expect(template).not.toMatch(/DownloadAttachmentQueue:[\s\S]*?RedrivePolicy:/);
    expect(template).toContain('QueueName: !Sub "timtro-download-attachment-${EnvironmentName}"');
    expect(template).toContain("VisibilityTimeout: 360");
    expect(template).toContain("s3:GetObject");
    expect(template).toContain("public/*");
    expect(template).toContain('Value: public/attachments/');
    expect(template).toContain("NotificationConfiguration:");
    expect(template).toContain("UpdateAttachmentMetadataFunctionAttachmentMediaPermission");
    expect(template).not.toContain("GeminiApproved");
    expect(template).not.toMatch(/UpdateAttachmentMetadataFunction:[\s\S]*?Type: S3/);
    expect(template).toMatch(/DownloadAttachmentFunction:[\s\S]*?Timeout: 300/);
    expect(template).toMatch(/DownloadAttachmentFunction:[\s\S]*?MemorySize: 1024/);
    expect(template).toContain("Handler: download-attachment.handler");
    expect(template).toContain("Handler: update-attachment-metadata.handler");
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
    expect(template).toContain('TableName: !Sub "timtro-rental-info-v2-${EnvironmentName}"');
    expect(template).toContain('QueueName: !Sub "timtro-sanitization-${EnvironmentName}"');
    expect(template).toContain("RAW_RENTAL_POSTS_TABLE_NAME: !Ref RawRentalPostsTable");
    expect(template).toContain("RENTAL_INFO_TABLE_NAME: !Ref RentalInfoTableV2");
    expect(template).toContain("SANITIZATION_QUEUE_URL: !Ref SanitizationQueue");
    expect(template).toContain("DOWNLOAD_ATTACHMENT_QUEUE_URL: !Ref DownloadAttachmentQueue");
    expect(template).toContain('ATTACHMENT_MEDIA_BUCKET_NAME: !Sub "timtro-attachment-media-${EnvironmentName}"');
  });

  it("parameterizes provider and environment config", () => {
    for (const parameter of [
      "ApifyActorId",
      "FacebookGroupUrls",
      "ApifyToken",
      "GeminiApiKey",
      "GeminiModel"
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
      "LOG_LEVEL",
      "TIMTRO_USE_FAKE_PROVIDERS"
    ]) {
      expect(template).toContain(`${envVar}:`);
    }

    const crawlSection = template.split("CrawlFunction:")[1]?.split("SanitizeFunction:")[0] ?? "";
    expect(crawlSection).not.toContain("Environment:");
    expect(template).toMatch(
      /SanitizeFunction:[\s\S]*?DOWNLOAD_ATTACHMENT_QUEUE_URL: !Ref DownloadAttachmentQueue/
    );
    expect(template).toMatch(
      /DownloadAttachmentFunction:[\s\S]*?ATTACHMENT_MEDIA_BUCKET_NAME: !Sub "timtro-attachment-media-\$\{EnvironmentName\}"/
    );
    expect(template).toMatch(
      /DownloadAttachmentFunction:[\s\S]*?dynamodb:GetItem[\s\S]*?Resource: !GetAtt RentalInfoTableV2\.Arn/
    );
    expect(template).not.toMatch(
      /DownloadAttachmentFunction:[\s\S]*?Resource: !GetAtt RawRentalPostsTable\.Arn/
    );
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
  });
});

describe("CI and local event fixtures", () => {
  it.skipIf(!existsSync(workflowPath))("runs crawler-scoped Nx commands in CI", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain("pnpm nx test timtro-crawler");
    expect(workflow).toContain("pnpm nx build timtro-crawler");
    expect(workflow).not.toContain("sam build");
    expect(workflow).toContain("--config-env prod");
    expect(workflow).toContain("configure-aws-credentials");
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
