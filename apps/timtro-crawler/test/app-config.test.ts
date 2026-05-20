import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadCrawlerConfig } from "../src/services/config";

const project = JSON.parse(readFileSync(new URL("../project.json", import.meta.url), "utf8"));
const tsconfig = JSON.parse(readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"));

describe("timtro-crawler app configuration", () => {
  it("exposes Nx targets for app build, tests, SAM local, and deploy", () => {
    expect(project.name).toBe("timtro-crawler");
    expect(project.targets.build.options.command).toContain("TIMTRO_CRAWLER_HANDLER=crawl vite build");
    expect(project.targets.build.options.command).toContain("TIMTRO_CRAWLER_HANDLER=sanitize vite build");
    expect(project.targets.test.options.command).toBe("vitest run");
    expect(project.targets["sam:local:crawl"].options.command).toContain("--template template.yaml");
    expect(project.targets["sam:local:crawl"].options.command).not.toContain("sam build");
    expect(project.targets["sam:local:crawl"].options.command).toContain("--env-vars env.dev.json");
    expect(project.targets["sam:local:crawl"].options.command).toContain("events/crawl-schedule.json");
    expect(project.targets["sam:local:sanitize"].options.command).toContain("--template template.yaml");
    expect(project.targets["sam:local:sanitize"].options.command).not.toContain("sam build");
    expect(project.targets["sam:local:sanitize"].options.command).toContain("--env-vars env.dev.json");
    expect(project.targets["sam:local:sanitize"].options.command).toContain("events/sanitize-sqs.json");
    expect(project.targets.deploy.dependsOn).toEqual(["test", "build"]);
  });

  it("inherits strict root TypeScript configuration and overrides module settings for Vite", () => {
    expect(tsconfig.extends).toBe("../../tsconfig.base.json");
    expect(tsconfig.compilerOptions).not.toHaveProperty("strict");
    expect(tsconfig.compilerOptions).not.toHaveProperty("noUnusedLocals");
    expect(tsconfig.compilerOptions.module).toBe("ESNext");
    expect(tsconfig.compilerOptions.moduleResolution).toBe("bundler");
  });

  it("fails fast when required runtime config is missing", () => {
    expect(() => loadCrawlerConfig({})).toThrow("RAW_RENTAL_POSTS_TABLE_NAME");
  });

  it("allows fake provider mode without API tokens and exposes LocalStack endpoints", () => {
    expect(
      loadCrawlerConfig({
        RAW_RENTAL_POSTS_TABLE_NAME: "raw",
        RENTAL_INFO_TABLE_NAME: "info",
        SANITIZATION_QUEUE_URL: "queue",
        APIFY_ACTOR_ID: "actor",
        FACEBOOK_GROUP_URLS: "https://facebook.com/groups/one",
        TIMTRO_USE_FAKE_PROVIDERS: "true",
        DYNAMODB_ENDPOINT: "http://host.docker.internal:4566",
        SQS_ENDPOINT: "http://host.docker.internal:4566"
      })
    ).toMatchObject({
      useFakeProviders: true,
      apifyToken: undefined,
      geminiApiKey: undefined,
      dynamodbEndpoint: "http://host.docker.internal:4566",
      sqsEndpoint: "http://host.docker.internal:4566"
    });
  });
});
