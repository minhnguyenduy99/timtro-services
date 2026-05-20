import { describe, expect, it } from "vitest";

import { SqsSanitizationQueue } from "../../src/services/aws-clients";

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
});
