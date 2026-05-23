import { ApifyClient } from "apify-client";

import type { ApifyFacebookPost } from "../domain/raw-rental-post";

export type ApifyRunOptions = {
  actorId: string;
  groupUrls: string[];
};

export type ApifyActorMetadata = {
  id: string;
  name?: string;
  username?: string;
};

export type ApifyCrawlerProvider = {
  getActorMetadata(actorId: string): Promise<ApifyActorMetadata>;
  runFacebookGroupActor(options: ApifyRunOptions): Promise<{ runId: string; items: ApifyFacebookPost[] }>;
};

type ActorClient = {
  get(): Promise<ApifyActorMetadata>;
  call(input: Record<string, unknown>): Promise<{ id?: string; defaultDatasetId?: string }>;
};

type DatasetClient = {
  listItems(): Promise<{ items: ApifyFacebookPost[] }>;
};

type ApifyClientLike = {
  actor(actorId: string): ActorClient;
  dataset(datasetId: string): DatasetClient;
};

export class ApifyClientProvider implements ApifyCrawlerProvider {
  private readonly client: ApifyClientLike;

  constructor(token: string, client?: ApifyClientLike) {
    this.client = client ?? (new ApifyClient({ token }) as unknown as ApifyClientLike);
  }

  async getActorMetadata(actorId: string): Promise<ApifyActorMetadata> {
    const metadata = await this.client.actor(actorId).get();
    if (!metadata) {
      throw new Error(`Apify actor ${actorId} was not found`);
    }
    return metadata;
  }

  async runFacebookGroupActor(options: ApifyRunOptions): Promise<{ runId: string; items: ApifyFacebookPost[] }> {
    const input = {
      startUrls: options.groupUrls.map((url) => ({ url })),
      resultsLimit: 1,
      maxPostDate: "7 days"
    };
    const run = await this.client.actor(options.actorId).call(input);
    if (!run.defaultDatasetId) {
      throw new Error(`Apify actor ${options.actorId} did not return a dataset id`);
    }
    const dataset = await this.client.dataset(run.defaultDatasetId).listItems();
    return {
      runId: run.id ?? run.defaultDatasetId,
      items: dataset.items
    };
  }
}

export class FakeApifyCrawlerProvider implements ApifyCrawlerProvider {
  constructor(private readonly items: ApifyFacebookPost[] = []) {}

  async getActorMetadata(actorId: string): Promise<ApifyActorMetadata> {
    return { id: actorId, name: "Fake Facebook group actor" };
  }

  async runFacebookGroupActor(): Promise<{ runId: string; items: ApifyFacebookPost[] }> {
    return { runId: "fake-apify-run", items: this.items };
  }
}
