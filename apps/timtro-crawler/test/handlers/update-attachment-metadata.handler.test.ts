import { describe, expect, it } from "vitest";
import type { S3Event } from "aws-lambda";

import { runUpdateAttachmentMetadataBatch } from "../../src/handlers/update-attachment-metadata.handler";
import { UpdateAttachmentMetadataService } from "../../src/services/update-attachment-metadata.service";

describe("update attachment metadata handler", () => {
  it("parses S3 keys and updates rental info by region, listing id, and index", async () => {
    const service = {
      processMirroredObject: async (parsed: { region: string; id: string; index: number }, key: string) => {
        expect(parsed).toEqual({
          region: "ho_chi_minh_district_1",
          id: "fb_post",
          index: 1,
          extension: "jpg"
        });
        expect(key).toBe("public/attachments/ho_chi_minh_district_1/fb_post/1.jpg");
        return { updated: 1, skipped: 0, failed: 0 };
      }
    } as unknown as UpdateAttachmentMetadataService;

    await expect(
      runUpdateAttachmentMetadataBatch(
        {
          Records: [
            {
              eventVersion: "2.1",
              eventSource: "aws:s3",
              awsRegion: "ap-southeast-1",
              eventTime: "2026-05-26T12:00:00.000Z",
              eventName: "ObjectCreated:Put",
              s3: {
                s3SchemaVersion: "1.0",
                configurationId: "AttachmentMediaCreated",
                bucket: {
                  name: "bucket",
                  arn: "arn",
                  ownerIdentity: { principalId: "principal" }
                },
                object: {
                  key: "public/attachments/ho_chi_minh_district_1/fb_post/1.jpg",
                  size: 1,
                  eTag: "etag",
                  sequencer: "0"
                }
              }
            }
          ]
        } as S3Event,
        { service }
      )
    ).resolves.toBeUndefined();
  });

  it("fails the invocation when any listing update fails", async () => {
    const service = {
      processMirroredObject: async () => ({ updated: 0, skipped: 0, failed: 1 })
    } as unknown as UpdateAttachmentMetadataService;

    await expect(
      runUpdateAttachmentMetadataBatch(
        {
          Records: [
            {
              eventVersion: "2.1",
              eventSource: "aws:s3",
              awsRegion: "ap-southeast-1",
              eventTime: "2026-05-26T12:00:00.000Z",
              eventName: "ObjectCreated:Put",
              s3: {
                s3SchemaVersion: "1.0",
                configurationId: "AttachmentMediaCreated",
                bucket: {
                  name: "bucket",
                  arn: "arn",
                  ownerIdentity: { principalId: "principal" }
                },
                object: {
                  key: "public/attachments/ho_chi_minh_district_1/fb_post/0.jpg",
                  size: 1,
                  eTag: "etag",
                  sequencer: "0"
                }
              }
            }
          ]
        } as S3Event,
        { service }
      )
    ).rejects.toThrow("attachment metadata update failed");
  });
});
