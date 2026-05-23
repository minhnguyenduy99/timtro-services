import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawRentalPost } from "../../src/domain/raw-rental-post";
import type { SanitizationMessage } from "../../src/domain/sanitization-message";
import type { RawPostStore, SanitizationQueue } from "../../src/services/aws-clients";
import { RawPostIngestionService } from "../../src/services/raw-post-ingestion.service";

const post = {
  facebookId: "2573980229535866",
  legacyId: "4675629119370956",
  url: "https://facebook.com/post",
  text: "Cho thue phong tro",
  topComments: [{ commentId: "comment-1", text: "Lien he ngay" }]
};

class MemoryRawPostStore implements RawPostStore {
  readonly records = new Map<string, RawRentalPost>();

  async get(rawPostId: string): Promise<RawRentalPost | undefined> {
    return this.records.get(rawPostId);
  }

  async putNew(rawPost: RawRentalPost): Promise<void> {
    this.records.set(rawPost.id, rawPost);
  }

  async updateChanged(rawPost: RawRentalPost): Promise<void> {
    this.records.set(rawPost.id, rawPost);
  }

  async markCompleted(): Promise<void> {
    throw new Error("not used");
  }

  async markFailed(): Promise<void> {
    throw new Error("not used");
  }
}

class MemoryQueue implements SanitizationQueue {
  readonly messages: SanitizationMessage[] = [];
  send = vi.fn(async (message: SanitizationMessage) => {
    this.messages.push(message);
  });
}

describe("RawPostIngestionService", () => {
  let store: MemoryRawPostStore;
  let queue: MemoryQueue;
  let service: RawPostIngestionService;

  beforeEach(() => {
    store = new MemoryRawPostStore();
    queue = new MemoryQueue();
    service = new RawPostIngestionService(store, queue);
  });

  it("stores new posts as pending and enqueues sanitization messages", async () => {
    const result = await service.ingest([post, { ...post, legacyId: "second" }], "run-1");

    expect(result).toMatchObject({ stored: 2, changed: 0, unchanged: 0, enqueued: 2 });
    expect([...store.records.values()].map((record) => record.processStatus)).toEqual(["pending", "pending"]);
    expect(queue.messages[0]).toMatchObject({
      rawPostId: "fb_2573980229535866_4675629119370956",
      source: "fb",
      groupId: "2573980229535866",
      postId: "4675629119370956"
    });
  });

  it("preserves top comments as raw evidence", async () => {
    await service.ingest([post], "run-1");

    expect(store.records.get("fb_2573980229535866_4675629119370956")?.comments).toEqual([
      {
        commentId: "comment-1",
        text: "Lien he ngay",
        url: undefined,
        timestamp: undefined
      }
    ]);
  });

  it("re-enqueues unchanged pending posts so prior SQS send failures can be replayed", async () => {
    await service.ingest([post], "run-1");
    const result = await service.ingest([post], "run-2");

    expect(result).toMatchObject({ stored: 0, changed: 0, unchanged: 1, enqueued: 1 });
    expect(queue.send).toHaveBeenCalledTimes(2);
  });

  it("resets changed records to pending and enqueues them again", async () => {
    await service.ingest([post], "run-1");
    const result = await service.ingest([{ ...post, text: "Noi dung da sua" }], "run-2");

    expect(result).toMatchObject({ stored: 0, changed: 1, unchanged: 0, enqueued: 1 });
    expect(store.records.get("fb_2573980229535866_4675629119370956")).toMatchObject({
      processStatus: "pending",
      text: "Noi dung da sua"
    });
    expect(queue.send).toHaveBeenCalledTimes(2);
  });

  it("leaves the raw record pending when enqueue fails", async () => {
    queue.send.mockRejectedValueOnce(new Error("SQS unavailable"));

    await expect(service.ingest([post], "run-1")).rejects.toThrow("SQS unavailable");
    expect(store.records.get("fb_2573980229535866_4675629119370956")?.processStatus).toBe("pending");
  });

  it("does not enqueue sanitization when enqueue is disabled", async () => {
    service = new RawPostIngestionService(store, queue, { enqueueSanitization: false });

    const result = await service.ingest([post], "run-1");

    expect(result).toMatchObject({ stored: 1, enqueued: 0 });
    expect(store.records.get("fb_2573980229535866_4675629119370956")?.processStatus).toBe("pending");
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("clears sanitizedCount when changed content resets a completed record to pending", async () => {
    await service.ingest([post], "run-1");
    store.records.set("fb_2573980229535866_4675629119370956", {
      ...store.records.get("fb_2573980229535866_4675629119370956")!,
      processStatus: "completed",
      sanitizedCount: 2
    });

    await service.ingest([{ ...post, text: "Noi dung da sua" }], "run-2");

    expect(store.records.get("fb_2573980229535866_4675629119370956")).toMatchObject({
      processStatus: "pending",
      text: "Noi dung da sua"
    });
    expect(store.records.get("fb_2573980229535866_4675629119370956")?.sanitizedCount).toBeUndefined();
  });
});
