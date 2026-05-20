import { describe, expect, it, vi } from "vitest";

import type { ApifyCrawlerProvider } from "../../src/providers/apify-client.provider";
import { ApifyCrawlerService } from "../../src/services/apify-crawler.service";

describe("ApifyCrawlerService", () => {
  it("fetches actor metadata before running configured Facebook groups", async () => {
    const provider: ApifyCrawlerProvider = {
      getActorMetadata: vi.fn(async (actorId) => ({ id: actorId })),
      runFacebookGroupActor: vi.fn(async () => ({
        runId: "run-1",
        items: [{ facebookId: "group", legacyId: "post" }]
      }))
    };
    const service = new ApifyCrawlerService(provider);

    await expect(service.crawl({ actorId: "actor", groupUrls: ["https://facebook.com/groups/group"] })).resolves.toEqual({
      crawlRunId: "run-1",
      posts: [{ facebookId: "group", legacyId: "post" }]
    });
    expect(provider.getActorMetadata).toHaveBeenCalledWith("actor");
    expect(provider.runFacebookGroupActor).toHaveBeenCalledWith({
      actorId: "actor",
      groupUrls: ["https://facebook.com/groups/group"]
    });
  });

  it("propagates actor failures so scheduler retries or alarms can handle the run", async () => {
    const provider: ApifyCrawlerProvider = {
      getActorMetadata: vi.fn(async () => ({ id: "actor" })),
      runFacebookGroupActor: vi.fn(async () => {
        throw new Error("actor failed");
      })
    };

    await expect(new ApifyCrawlerService(provider).crawl({ actorId: "actor", groupUrls: [] })).rejects.toThrow(
      "actor failed"
    );
  });
});
