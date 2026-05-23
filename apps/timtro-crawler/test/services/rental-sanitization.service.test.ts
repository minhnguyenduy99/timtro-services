import { beforeEach, describe, expect, it } from "vitest";

import { mapApifyPostToRawPost, type ProcessError, type RawRentalPost } from "../../src/domain/raw-rental-post";
import type { RentalInfo } from "../../src/domain/rental-info";
import { DomainValidationError } from "../../src/domain/schemas";
import type { SanitizationMessage } from "../../src/domain/sanitization-message";
import { AiProviderError, type AiSanitizationResult, type AiSanitizerProvider } from "../../src/providers/ai/ai-sanitizer.provider";
import type { RawPostStore, RentalInfoStore } from "../../src/services/aws-clients";
import { RentalSanitizationService } from "../../src/services/rental-sanitization.service";

const rawPost = mapApifyPostToRawPost({
  facebookId: "group",
  legacyId: "post",
  url: "https://facebook.com/post",
  text: "Cho thue phong tro"
});

const message: SanitizationMessage = {
  rawPostId: rawPost.id,
  contentHash: rawPost.contentHash,
  crawlRunId: "run",
  source: "fb",
  groupId: "group",
  postId: "post"
};

const rentalInfo: RentalInfo = {
  region: "ho_chi_minh_district_1",
  id: "fb_post",
  source: "fb",
  sourcePostId: "post",
  address: "123 Nguyen Trai",
  city: "ho_chi_minh",
  cityLabel: "Hồ Chí Minh",
  district: "district_1",
  districtLabel: "Quận 1",
  title: "Phong tro Quan 1",
  description: "Cho thue phong tro",
  price: 3_200_000,
  priceUnit: "VND",
  postDate: "2026-05-19T00:00:00.000Z",
  timestamp: "2026-05-20T00:00:00.000Z",
  originalLink: "https://facebook.com/post",
  attachments: []
};

class MemoryRawStore implements RawPostStore {
  record: RawRentalPost | undefined = rawPost;
  completedCount: number | undefined;
  failedError: ProcessError | undefined;

  async get(): Promise<RawRentalPost | undefined> {
    return this.record;
  }

  async putNew(): Promise<void> {
    throw new Error("not used");
  }

  async updateChanged(): Promise<void> {
    throw new Error("not used");
  }

  async markCompleted(_rawPostId: string, _expectedContentHash: string, sanitizedCount: number): Promise<void> {
    this.completedCount = sanitizedCount;
    if (this.record) {
      this.record = { ...this.record, processStatus: "completed", sanitizedCount };
    }
  }

  async markFailed(_rawPostId: string, _expectedContentHash: string, processError: ProcessError): Promise<void> {
    this.failedError = processError;
    if (this.record) {
      this.record = { ...this.record, processStatus: "fail", processError };
    }
  }
}

class MemoryRentalInfoStore implements RentalInfoStore {
  records: RentalInfo[] = [];

  async put(record: RentalInfo): Promise<void> {
    this.records.push(record);
  }
}

class StaticProvider implements AiSanitizerProvider {
  constructor(private readonly result: AiSanitizationResult | Error) {}

  async sanitize(): Promise<AiSanitizationResult> {
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }
}

describe("RentalSanitizationService", () => {
  let rawStore: MemoryRawStore;
  let rentalStore: MemoryRentalInfoStore;

  beforeEach(() => {
    rawStore = new MemoryRawStore();
    rentalStore = new MemoryRentalInfoStore();
  });

  it("writes rental info before marking raw post completed", async () => {
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider({
        kind: "rental_info",
        records: [rentalInfo],
        metadata: { provider: "fake", model: "fake", promptVersion: "v1", schemaVersion: "v1" }
      })
    );

    await expect(service.process(message)).resolves.toEqual({ outcome: "completed", sanitizedCount: 1 });
    expect(rentalStore.records).toEqual([rentalInfo]);
    expect(rawStore.completedCount).toBe(1);
  });

  it("writes multiple rental info records from one raw post", async () => {
    const commentRental = { ...rentalInfo, id: "fb_comment", sourceCommentId: "comment" };
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider({
        kind: "rental_info",
        records: [rentalInfo, commentRental],
        metadata: { provider: "fake", model: "fake", promptVersion: "v1", schemaVersion: "v1" }
      })
    );

    await service.process(message);
    expect(rentalStore.records).toHaveLength(2);
    expect(rawStore.completedCount).toBe(2);
  });

  it("skips duplicate delivery after completion without another provider call", async () => {
    rawStore.record = { ...rawPost, processStatus: "completed" };
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider(new Error("provider should not be called"))
    );

    await expect(service.process(message)).resolves.toEqual({ outcome: "skipped", reason: "already_completed" });
    expect(rentalStore.records).toEqual([]);
  });

  it("skips stale messages without overwriting newer sanitized data", async () => {
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider(new Error("provider should not be called"))
    );

    await expect(service.process({ ...message, contentHash: "old" })).resolves.toEqual({
      outcome: "skipped",
      reason: "stale_message"
    });
  });

  it("marks non-rentals completed with zero sanitized records", async () => {
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider({
        kind: "non_rental",
        records: [],
        metadata: { provider: "fake", model: "fake", promptVersion: "v1", schemaVersion: "v1" }
      })
    );

    await expect(service.process(message)).resolves.toEqual({ outcome: "completed", sanitizedCount: 0 });
    expect(rawStore.completedCount).toBe(0);
  });

  it("marks validation failures as redacted terminal failures", async () => {
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider(new DomainValidationError("raw district value should not be stored"))
    );

    await expect(service.process(message)).resolves.toMatchObject({ outcome: "failed" });
    expect(rawStore.failedError).toMatchObject({
      category: "validation",
      message: "validation",
      retryable: false
    });
    expect(rentalStore.records).toEqual([]);
  });

  it("returns retry for transient Gemini timeouts and leaves raw status pending", async () => {
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider(
        new AiProviderError("TimeoutError", "retryable", {
          provider: "gemini",
          model: "model",
          promptVersion: "v1",
          schemaVersion: "v1"
        })
      )
    );

    await expect(service.process(message)).resolves.toMatchObject({ outcome: "retry" });
    expect(rawStore.record?.processStatus).toBe("pending");
  });

  it("does not mark raw completed when rental info persistence fails", async () => {
    rentalStore.put = async () => {
      throw new Error("DynamoDB throttled");
    };
    const service = new RentalSanitizationService(
      rawStore,
      rentalStore,
      new StaticProvider({
        kind: "rental_info",
        records: [rentalInfo],
        metadata: { provider: "fake", model: "fake", promptVersion: "v1", schemaVersion: "v1" }
      })
    );

    await expect(service.process(message)).resolves.toMatchObject({ outcome: "retry" });
    expect(rawStore.completedCount).toBeUndefined();
  });
});
