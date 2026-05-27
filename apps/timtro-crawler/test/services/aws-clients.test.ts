import { describe, expect, it } from "vitest";

import type { RentalInfo } from "@timtro/rental-info";
import {
  buildAttachmentMediaKey,
  buildPublicS3Url,
  DynamoRentalInfoStore,
  parseAttachmentMediaKey,
  S3AttachmentMediaStore,
  SqsDownloadAttachmentQueue,
  SqsSanitizationQueue
} from "../../src/services/aws-clients";
import { nodeReadableFromBuffer } from "../../src/services/attachment-stream";

describe("AWS client helpers", () => {
  it("serializes sanitization messages without raw post text", async () => {
    const sent: unknown[] = [];
    const queue = new SqsSanitizationQueue(
      {
        send: async (command: unknown) => {
          sent.push(command);
          return {};
        }
      } as never,
      "https://sqs.local/queue"
    );

    await queue.send({
      rawPostId: "fb_group_post",
      contentHash: "hash",
      crawlRunId: "run",
      source: "fb",
      groupId: "group",
      postId: "post"
    });

    expect(JSON.stringify(sent[0])).toContain("fb_group_post");
    expect(JSON.stringify(sent[0])).not.toContain("Cho thue");
  });

  it("serializes download attachment messages without attachment URLs in the body", async () => {
    const sent: unknown[] = [];
    const queue = new SqsDownloadAttachmentQueue(
      {
        send: async (command: unknown) => {
          sent.push(command);
          return {};
        }
      } as never,
      "https://sqs.local/download"
    );

    await queue.send({
      region: "ho_chi_minh_district_1",
      id: "fb_post"
    });

    const command = sent[0] as { input: { MessageBody: string } };
    const body = command.input.MessageBody;
    expect(body).toContain("ho_chi_minh_district_1");
    expect(body).toContain("fb_post");
    expect(body).not.toContain("fbcdn");
    expect(body).not.toContain("facebook.com");
  });

  it("builds public S3 URLs, media keys, and parses them back", () => {
    expect(
      buildPublicS3Url(
        "timtro-attachment-media-dev",
        "ap-southeast-1",
        "public/attachments/ho_chi_minh_district_1/fb_post/0.jpg"
      )
    ).toBe(
      "https://timtro-attachment-media-dev.s3.ap-southeast-1.amazonaws.com/public/attachments/ho_chi_minh_district_1/fb_post/0.jpg"
    );
    expect(buildAttachmentMediaKey("ho_chi_minh_district_1", "fb_post", 1, "png")).toBe(
      "public/attachments/ho_chi_minh_district_1/fb_post/1.png"
    );
    expect(parseAttachmentMediaKey("public/attachments/ho_chi_minh_district_1/fb_post/1.png")).toEqual({
      region: "ho_chi_minh_district_1",
      id: "fb_post",
      index: 1,
      extension: "png"
    });
  });

  it("updates a single attachment url by index", async () => {
    const sent: unknown[] = [];
    const store = new DynamoRentalInfoStore(
      {
        send: async (command: unknown) => {
          sent.push(command);
          return {};
        }
      } as never,
      "timtro-rental-info-v2-dev"
    );

    await store.updateAttachmentUrl(
      "ho_chi_minh_district_1",
      "fb_post",
      0,
      "https://bucket.s3.ap-southeast-1.amazonaws.com/public/attachments/ho_chi_minh_district_1/fb_post/0.jpg"
    );

    expect(JSON.stringify(sent[0])).toContain("attachments[0].#url");
    expect(JSON.stringify(sent[0])).toContain("attribute_exists(attachments[0])");
  });

  it("uploads attachment media with inline content disposition", async () => {
    const sent: unknown[] = [];
    const store = new S3AttachmentMediaStore(
      {
        send: async (command: unknown) => {
          sent.push(command);
          return {};
        }
      } as never,
      "timtro-attachment-media-dev"
    );

    await store.putObjectStream(
      "public/attachments/ho_chi_minh_district_1/fb_post/0.jpg",
      nodeReadableFromBuffer(new Uint8Array([1, 2, 3])),
      "image/jpeg"
    );

    const command = sent[0] as { input: { ContentDisposition?: string; ContentType?: string; Key?: string } };
    expect(command.input.ContentDisposition).toBe("inline");
    expect(command.input.ContentType).toBe("image/jpeg");
    expect(command.input.Key).toBe("public/attachments/ho_chi_minh_district_1/fb_post/0.jpg");
  });

  it("loads rental info by region and id", async () => {
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
      title: "Phong tro",
      description: "Cho thue",
      price: 3_200_000,
      priceUnit: "VND",
      postDate: "2026-05-19T00:00:00.000Z",
      timestamp: "2026-05-20T00:00:00.000Z",
      originalLink: "https://facebook.com/post",
      attachments: []
    };
    const store = new DynamoRentalInfoStore(
      {
        send: async () => ({ Item: rentalInfo })
      } as never,
      "timtro-rental-info-v2-dev"
    );

    await expect(store.get("ho_chi_minh_district_1", "fb_post")).resolves.toEqual(rentalInfo);
  });
});
