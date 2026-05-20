import { describe, expect, it } from "vitest";

import {
  buildRawPostId,
  extractAttachmentSummaries,
  extractFacebookPostIdentity,
  mapApifyPostToRawPost
} from "../../src/domain/raw-rental-post";
import { buildRentalInfoId } from "../../src/domain/rental-info";

describe("Facebook source identity mapping", () => {
  it("builds raw post ids from group and post identifiers", () => {
    expect(buildRawPostId("2573980229535866", "4675629119370956")).toBe(
      "fb_2573980229535866_4675629119370956"
    );
  });

  it("uses legacyId for post identity and falls back to a stable post id", () => {
    expect(extractFacebookPostIdentity({ facebookId: "group", legacyId: "legacy", id: "fallback" })).toEqual({
      groupId: "group",
      postId: "legacy"
    });
    expect(extractFacebookPostIdentity({ facebookId: "group", id: "fallback" })).toEqual({
      groupId: "group",
      postId: "fallback"
    });
  });

  it("builds deterministic sanitized ids for posts and comments", () => {
    expect(buildRentalInfoId("4675629119370956")).toBe("fb_4675629119370956");
    expect(buildRentalInfoId("4675629119370956", "4675629046037630")).toBe("fb_4675629046037630");
  });

  it("keeps comments inside raw post evidence for sanitizer fan-out", () => {
    const rawPost = mapApifyPostToRawPost({
      facebookId: "2573980229535866",
      legacyId: "4675629119370956",
      text: "Cho thue phong tro",
      topComments: [
        {
          commentId: "4675629046037630",
          commentUrl: "https://facebook.com/comment",
          text: "Phong trong quan 1"
        }
      ]
    });

    expect(rawPost.comments).toEqual([
      {
        commentId: "4675629046037630",
        text: "Phong trong quan 1",
        url: "https://facebook.com/comment",
        timestamp: undefined
      }
    ]);
  });

  it("extracts nested photo and video attachment summaries", () => {
    expect(
      extractAttachmentSummaries([
        { type: "Photo", media: { image: { uri: "https://example.com/full.jpg" } } },
        { type: "Video", thumbnail: { url: "https://example.com/video.jpg" } },
        { type: "Unknown" }
      ])
    ).toEqual([
      { type: "photo", url: "https://example.com/full.jpg" },
      { type: "video", url: "https://example.com/video.jpg" }
    ]);
  });
});
