import { describe, expect, it } from "vitest";
import type { SQSEvent } from "aws-lambda";

import { runDownloadAttachmentBatch } from "../../src/handlers/download-attachment.handler";
import { DownloadAttachmentService } from "../../src/services/download-attachment.service";

function eventWithBodies(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map((body, index) => ({
      messageId: `message-${index}`,
      receiptHandle: "receipt",
      body,
      attributes: {
        ApproximateReceiveCount: "1",
        SentTimestamp: "1",
        SenderId: "sender",
        ApproximateFirstReceiveTimestamp: "1"
      },
      messageAttributes: {},
      md5OfBody: "md5",
      eventSource: "aws:sqs",
      eventSourceARN: "arn",
      awsRegion: "ap-southeast-1"
    }))
  };
}

describe("download attachment handler", () => {
  it("acknowledges successes and returns partial failures for retryable records", async () => {
    const service = {
      process: async (message: { id: string }) =>
        message.id === "retry"
          ? { outcome: "retry", reason: "download_failed_403" }
          : { outcome: "completed", attachmentCount: 2 }
    } as unknown as DownloadAttachmentService;

    const response = await runDownloadAttachmentBatch(
      eventWithBodies([
        JSON.stringify({
          region: "ho_chi_minh_district_1",
          id: "success"
        }),
        JSON.stringify({
          region: "ho_chi_minh_district_1",
          id: "retry"
        })
      ]),
      { service }
    );

    expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: "message-1" }] });
  });

  it("acks malformed messages without retrying", async () => {
    const response = await runDownloadAttachmentBatch(eventWithBodies(["not-json"]), {
      service: {} as DownloadAttachmentService
    });

    expect(response).toEqual({ batchItemFailures: [] });
  });
});
