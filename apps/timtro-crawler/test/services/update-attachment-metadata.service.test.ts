import { describe, expect, it } from "vitest";

import type { RentalInfo } from "@timtro/rental-info";
import type { RentalInfoStore } from "../../src/services/aws-clients";
import { UpdateAttachmentMetadataService } from "../../src/services/update-attachment-metadata.service";

const baseRentalInfo: RentalInfo = {
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
    { type: "photo", url: "https://facebook.com/a.jpg" },
    { type: "video", url: "https://facebook.com/b.mp4" }
  ]
};

class MemoryRentalInfoStore implements RentalInfoStore {
  records = new Map<string, RentalInfo>();

  constructor(initial: RentalInfo[] = []) {
    for (const record of initial) {
      this.records.set(`${record.region}:${record.id}`, record);
    }
  }

  async put(rentalInfo: RentalInfo): Promise<void> {
    this.records.set(`${rentalInfo.region}:${rentalInfo.id}`, rentalInfo);
  }

  async get(region: string, id: string): Promise<RentalInfo | undefined> {
    return this.records.get(`${region}:${id}`);
  }

  async updateAttachmentUrl(
    region: string,
    id: string,
    attachmentIndex: number,
    publicUrl: string
  ): Promise<void> {
    const record = this.records.get(`${region}:${id}`);
    if (!record) {
      throw new Error("missing");
    }
    const attachment = record.attachments[attachmentIndex];
    if (!attachment) {
      const error = new Error("attachment index missing");
      error.name = "ConditionalCheckFailedException";
      throw error;
    }
    const attachments = [...record.attachments];
    attachments[attachmentIndex] = { ...attachment, url: publicUrl };
    this.records.set(`${region}:${id}`, { ...record, attachments });
  }
}

describe("UpdateAttachmentMetadataService", () => {
  const serviceConfig = {
    bucketName: "timtro-attachment-media-dev",
    awsRegion: "ap-southeast-1"
  };

  const parsedKey = {
    region: "ho_chi_minh_district_1",
    id: "fb_post",
    index: 0,
    extension: "jpg"
  };

  it("updates the attachment url for the listing identified in the S3 key", async () => {
    const store = new MemoryRentalInfoStore([baseRentalInfo]);
    const service = new UpdateAttachmentMetadataService(store, serviceConfig);
    const s3Key = "public/attachments/ho_chi_minh_district_1/fb_post/0.jpg";
    const publicUrl = `https://${serviceConfig.bucketName}.s3.${serviceConfig.awsRegion}.amazonaws.com/${s3Key}`;

    await expect(service.processMirroredObject(parsedKey, s3Key)).resolves.toEqual({
      updated: 1,
      skipped: 0,
      failed: 0
    });

    expect(store.records.get("ho_chi_minh_district_1:fb_post")?.attachments[0]?.url).toBe(publicUrl);
    expect(store.records.get("ho_chi_minh_district_1:fb_post")?.attachments[1]?.url).toBe("https://facebook.com/b.mp4");
  });

  it("skips when the attachment index does not exist on the listing", async () => {
    const store = new MemoryRentalInfoStore([baseRentalInfo]);
    const service = new UpdateAttachmentMetadataService(store, serviceConfig);

    await expect(
      service.processMirroredObject(
        { ...parsedKey, index: 9 },
        "public/attachments/ho_chi_minh_district_1/fb_post/9.jpg"
      )
    ).resolves.toEqual({ updated: 0, skipped: 1, failed: 0 });
  });

  it("fails when the listing key does not exist", async () => {
    const store = new MemoryRentalInfoStore([]);
    const service = new UpdateAttachmentMetadataService(store, serviceConfig);

    await expect(
      service.processMirroredObject(parsedKey, "public/attachments/ho_chi_minh_district_1/fb_post/0.jpg")
    ).resolves.toEqual({ updated: 0, skipped: 0, failed: 1 });
  });
});
