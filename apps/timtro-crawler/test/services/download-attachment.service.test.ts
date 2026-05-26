import { describe, expect, it } from "vitest";

import type { RentalInfo } from "@timtro/rental-info";

import type { DownloadAttachmentMessage } from "../../src/domain/download-attachment-message";
import {
  DEFAULT_MAX_PHOTO_BYTES,
  limitReadableByteCount,
  nodeReadableFromBuffer,
  readReadableToUint8Array
} from "../../src/services/attachment-stream";
import type { RentalInfoStore, S3MediaStore } from "../../src/services/aws-clients";
import {
  dedupeAttachments,
  DownloadAttachmentService,
  extensionFromContentType
} from "../../src/services/download-attachment.service";

const listing: RentalInfo = {
  region: "ho_chi_minh_district_1",
  id: "fb_post",
  source: "fb",
  sourcePostId: "fb_post",
  address: "123 Nguyen Trai",
  city: "ho_chi_minh",
  cityLabel: "Hồ Chí Minh",
  district: "district_1",
  districtLabel: "Quận 1",
  title: "Phong tro",
  description: "Cho thue",
  price: 3_200_000,
  priceUnit: "VND",
  postDate: "2026-05-19T00:00:00.000Z",
  timestamp: "2026-05-20T00:00:00.000Z",
  originalLink: "https://facebook.com/post",
  attachments: [
    { type: "photo", url: "https://facebook.com/photo-a.jpg?token=1" },
    { type: "photo", url: "https://facebook.com/photo-a.jpg?token=2" },
    { type: "photo", url: "https://facebook.com/photo-b.jpg" }
  ]
};

const message: DownloadAttachmentMessage = {
  region: listing.region,
  id: listing.id
};

const serviceConfig = {
  attachmentMediaBucketName: "timtro-attachment-media-dev",
  awsRegion: "ap-southeast-1"
};

class MemoryRentalInfoStore implements RentalInfoStore {
  constructor(private readonly record: RentalInfo | null = listing) {}

  async get(region: string, id: string): Promise<RentalInfo | undefined> {
    if (this.record === null || this.record.region !== region || this.record.id !== id) {
      return undefined;
    }
    return this.record;
  }

  async put(): Promise<void> {
    throw new Error("not used");
  }

  async updateAttachmentUrl(): Promise<void> {
    throw new Error("not used");
  }
}

class MemoryMediaStore implements S3MediaStore {
  objects: Array<{ key: string; body: Uint8Array; contentType: string }> = [];

  async putObjectStream(
    key: string,
    body: import("node:stream").Readable,
    contentType: string
  ): Promise<void> {
    this.objects.push({
      key,
      body: await readReadableToUint8Array(body),
      contentType
    });
  }
}

describe("download attachment helpers", () => {
  it("dedupes attachments by URL without query string", () => {
    expect(dedupeAttachments(listing.attachments)).toHaveLength(2);
  });

  it("derives extensions from content type and URL path", () => {
    expect(extensionFromContentType("image/jpeg", "https://facebook.com/file")).toBe("jpg");
    expect(extensionFromContentType(null, "https://facebook.com/file.png")).toBe("png");
  });

  it("rejects streams that exceed the byte limit while reading", async () => {
    const limited = limitReadableByteCount(nodeReadableFromBuffer(new Uint8Array([1, 2, 3])), 2);
    await expect(readReadableToUint8Array(limited)).rejects.toMatchObject({ name: "AttachmentTooLargeError" });
  });
});

describe("DownloadAttachmentService", () => {
  it("streams downloads into S3 from rental info attachments", async () => {
    const mediaStore = new MemoryMediaStore();
    const fetcher = {
      fetch: async () => ({
        ok: true as const,
        status: 200,
        contentType: "image/jpeg",
        contentLength: 3,
        body: nodeReadableFromBuffer(new Uint8Array([1, 2, 3]))
      })
    };
    const service = new DownloadAttachmentService(new MemoryRentalInfoStore(), mediaStore, fetcher, serviceConfig);

    await expect(service.process(message)).resolves.toEqual({ outcome: "completed", attachmentCount: 2 });
    expect(mediaStore.objects).toHaveLength(2);
    expect(mediaStore.objects[0]?.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(mediaStore.objects[0]?.key).toBe("public/attachments/ho_chi_minh_district_1/fb_post/0.jpg");
    expect(mediaStore.objects[1]?.key).toBe("public/attachments/ho_chi_minh_district_1/fb_post/2.jpg");
  });

  it("skips attachments larger than the declared content length", async () => {
    const mediaStore = new MemoryMediaStore();
    const service = new DownloadAttachmentService(new MemoryRentalInfoStore(), mediaStore, {
      fetch: async () => ({
        ok: true as const,
        status: 200,
        contentType: "image/jpeg",
        contentLength: DEFAULT_MAX_PHOTO_BYTES + 1,
        body: nodeReadableFromBuffer(new Uint8Array([1]))
      })
    }, serviceConfig);

    await expect(service.process(message)).resolves.toEqual({ outcome: "completed", attachmentCount: 0 });
    expect(mediaStore.objects).toEqual([]);
  });

  it("skips missing listings without retrying", async () => {
    const service = new DownloadAttachmentService(
      new MemoryRentalInfoStore(null),
      new MemoryMediaStore(),
      {
        fetch: async () => ({
          ok: true as const,
          status: 200,
          contentType: "image/jpeg",
          contentLength: 1,
          body: nodeReadableFromBuffer(new Uint8Array([1]))
        })
      },
      serviceConfig
    );

    await expect(service.process(message)).resolves.toEqual({
      outcome: "skipped",
      reason: "missing_listing"
    });
  });

  it("skips attachments that are already mirrored to S3", async () => {
    const mediaStore = new MemoryMediaStore();
    const mirroredListing: RentalInfo = {
      ...listing,
      attachments: [
        {
          type: "photo",
          url: "https://timtro-attachment-media-dev.s3.ap-southeast-1.amazonaws.com/public/attachments/ho_chi_minh_district_1/fb_post/0.jpg"
        }
      ]
    };
    const service = new DownloadAttachmentService(
      new MemoryRentalInfoStore(mirroredListing),
      mediaStore,
      { fetch: async () => ({ ok: false as const, status: 500, contentType: null }) },
      serviceConfig
    );

    await expect(service.process(message)).resolves.toEqual({ outcome: "completed", attachmentCount: 0 });
    expect(mediaStore.objects).toEqual([]);
  });

  it("retries when any attachment download fails", async () => {
    let calls = 0;
    const service = new DownloadAttachmentService(
      new MemoryRentalInfoStore(),
      new MemoryMediaStore(),
      {
        fetch: async () => {
          calls += 1;
          return calls === 1
            ? {
                ok: true as const,
                status: 200,
                contentType: "image/jpeg",
                contentLength: 1,
                body: nodeReadableFromBuffer(new Uint8Array([1]))
              }
            : { ok: false as const, status: 403, contentType: null };
        }
      },
      serviceConfig
    );

    await expect(service.process(message)).resolves.toMatchObject({ outcome: "retry" });
  });
});
