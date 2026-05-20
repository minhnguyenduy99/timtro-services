import type { ApifyCrawlerProvider } from "../providers/apify-client.provider";
import type { ApifyFacebookPost } from "../domain/raw-rental-post";

export type CrawlRequest = {
  actorId: string;
  groupUrls: string[];
};

export type CrawlResult = {
  crawlRunId: string;
  posts: ApifyFacebookPost[];
};

export class ApifyCrawlerService {
  constructor(private readonly provider: ApifyCrawlerProvider) {}

  async crawl(request: CrawlRequest): Promise<CrawlResult> {
    await this.provider.getActorMetadata(request.actorId);
    const result = await this.provider.runFacebookGroupActor({
      actorId: request.actorId,
      groupUrls: request.groupUrls
    });

    return {
      crawlRunId: result.runId,
      posts: result.items
    };
  }
}
