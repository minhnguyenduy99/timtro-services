import { describe, expect, it } from "vitest";
import type { SQSEvent } from "aws-lambda";

import { RentalSanitizationService } from "../../src/services/rental-sanitization.service";
import { runSanitizeBatch } from "../../src/handlers/sanitize.handler";

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

describe("sanitize handler", () => {
  it("acknowledges successes and returns partial failures for retryable records", async () => {
    const service = {
      process: async (message: { rawPostId: string }) =>
        message.rawPostId === "retry"
          ? { outcome: "retry", reason: "DynamoDB throttled" }
          : { outcome: "completed", sanitizedCount: 1 }
    } as unknown as RentalSanitizationService;

    const response = await runSanitizeBatch(
      eventWithBodies([
        JSON.stringify({
          rawPostId: "success",
          contentHash: "hash",
          source: "fb",
          groupId: "group",
          postId: "post"
        }),
        JSON.stringify({
          rawPostId: "retry",
          contentHash: "hash",
          source: "fb",
          groupId: "group",
          postId: "post"
        })
      ]),
      { service }
    );

    expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: "message-1" }] });
  });

  it("returns malformed messages for retry and DLQ redrive", async () => {
    const response = await runSanitizeBatch(eventWithBodies(["not-json"]), {
      service: {} as RentalSanitizationService
    });

    expect(response).toEqual({ batchItemFailures: [{ itemIdentifier: "message-0" }] });
  });
});
