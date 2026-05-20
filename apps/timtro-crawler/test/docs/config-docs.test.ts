import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appReadme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const eventsReadme = readFileSync(new URL("../../events/README.md", import.meta.url), "utf8");
const template = readFileSync(new URL("../../template.yaml", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../../../../.github/workflows/timtro-crawler.yml", import.meta.url), "utf8");
const envExample = JSON.parse(readFileSync(new URL("../../env.example.json", import.meta.url), "utf8"));

describe("crawler operational documentation", () => {
  it("documents every required runtime environment variable and provider credential", () => {
    for (const name of [
      "RAW_RENTAL_POSTS_TABLE_NAME",
      "RENTAL_INFO_TABLE_NAME",
      "SANITIZATION_QUEUE_URL",
      "APIFY_ACTOR_ID",
      "FACEBOOK_GROUP_URLS",
      "GEMINI_MODEL",
      "APIFY_TOKEN",
      "GEMINI_API_KEY"
    ]) {
      expect(appReadme).toContain(name);
      expect(template).toContain(name);
    }
  });

  it("distinguishes local non-secret config from secret values", () => {
    expect(appReadme).toContain("Do not commit secret values");
    expect(appReadme).toContain("env.example.json");
    expect(eventsReadme).toContain("Keep real API tokens outside the repository");
    expect(eventsReadme).toContain("env.dev.json");
    expect(appReadme).toContain("TIMTRO_USE_FAKE_PROVIDERS");
  });

  it("documents sample SAM local env parameters", () => {
    for (const parameter of [
      "EnvironmentName",
      "ApifyActorId",
      "FacebookGroupUrls",
      "ApifyToken",
      "GeminiApiKey",
      "GeminiModel",
      "GeminiDataProcessingApproved",
      "TimtroUseFakeProviders"
    ]) {
      expect(envExample.Parameters).toHaveProperty(parameter);
    }

    for (const functionName of ["CrawlFunction", "SanitizeFunction"]) {
      expect(envExample[functionName]).toMatchObject({
        DYNAMODB_ENDPOINT: expect.any(String),
        SQS_ENDPOINT: expect.any(String)
      });
    }
  });

  it("documents GitHub deployment variables and OIDC guardrails", () => {
    for (const name of [
      "AWS_REGION",
      "AWS_DEPLOY_ROLE_ARN",
      "TIMTRO_CRAWLER_STACK_NAME",
      "TIMTRO_CRAWLER_ENVIRONMENT",
      "SAM_DEPLOY_BUCKET",
      "GEMINI_DATA_PROCESSING_APPROVED",
      "APIFY_ACTOR_ID",
      "FACEBOOK_GROUP_URLS",
      "APIFY_TOKEN",
      "GEMINI_API_KEY"
    ]) {
      expect(appReadme).toContain(name);
      expect(workflow).toContain(name);
    }
    expect(appReadme).toContain("OIDC trust");
  });

  it("documents replay and process status semantics", () => {
    expect(appReadme).toContain("Replay starts from raw records");
    expect(appReadme).toContain("pending");
    expect(appReadme).toContain("completed");
    expect(appReadme).toContain("fail");
  });
});
