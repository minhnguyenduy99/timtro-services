import { mapApifyPostToRawPost, type ApifyFacebookPost, type RawRentalPost } from "../domain/raw-rental-post";
import { createSanitizationMessage } from "../domain/sanitization-message";
import type { RawPostStore, SanitizationQueue } from "./aws-clients";

export type RawPostIngestionResult = {
  stored: number;
  changed: number;
  unchanged: number;
  enqueued: number;
};

export type RawPostIngestionOptions = {
  enqueueSanitization?: boolean;
};

export class RawPostIngestionService {
  constructor(
    private readonly store: RawPostStore,
    private readonly queue: SanitizationQueue,
    private readonly options: RawPostIngestionOptions = {}
  ) {}

  async ingest(posts: ApifyFacebookPost[], crawlRunId: string, now = new Date()): Promise<RawPostIngestionResult> {
    const result: RawPostIngestionResult = {
      stored: 0,
      changed: 0,
      unchanged: 0,
      enqueued: 0
    };

    for (const post of posts) {
      const rawPost = mapApifyPostToRawPost(post, crawlRunId, now);
      const existing = await this.store.get(rawPost.id);

      if (!existing) {
        await this.store.putNew(rawPost);
        result.stored += 1;
        if (await this.enqueue(rawPost, crawlRunId)) {
          result.enqueued += 1;
        }
        continue;
      }

      if (existing.contentHash === rawPost.contentHash) {
        result.unchanged += 1;
        if (existing.processStatus === "pending" && (await this.enqueue(rawPost, crawlRunId))) {
          result.enqueued += 1;
        }
        continue;
      }

      await this.store.updateChanged({
        ...rawPost,
        createdAt: existing.createdAt,
        processStatus: "pending",
        processError: undefined,
        sanitizedCount: undefined
      });
      result.changed += 1;
      if (await this.enqueue(rawPost, crawlRunId)) {
        result.enqueued += 1;
      }
    }

    return result;
  }

  private async enqueue(rawPost: RawRentalPost, crawlRunId: string): Promise<boolean> {
    if (this.options.enqueueSanitization === false) {
      return false;
    }

    await this.queue.send(
      createSanitizationMessage({
        rawPostId: rawPost.id,
        contentHash: rawPost.contentHash,
        crawlRunId,
        groupId: rawPost.groupId,
        postId: rawPost.postId
      })
    );
    return true;
  }
}
