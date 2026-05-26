import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildRawPostId,
  extractAttachmentSummaries,
  extractFacebookPostIdentity,
  mapApifyPostToRawPost
} from "../../src/domain/raw-rental-post";
import { buildRentalInfoId, buildSourcePostId } from "@timtro/rental-info";

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
    expect(buildSourcePostId("4675629119370956")).toBe("fb_4675629119370956");
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

  it("extracts Apify album and direct photo attachment shapes", () => {
    const samplePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../docs/assets/sample-data/facebook_group_apify_response.json"
    );
    const samplePosts = JSON.parse(readFileSync(samplePath, "utf8")) as Array<{ attachments?: unknown[] }>;

    const albumAttachments = extractAttachmentSummaries(samplePosts[0]?.attachments ?? []);
    expect(albumAttachments.length).toBeGreaterThan(0);
    expect(albumAttachments.every((attachment) => attachment.type === "photo")).toBe(true);
    expect(albumAttachments.every((attachment) => attachment.url.startsWith("https://"))).toBe(true);

    const directPhotoAttachments = extractAttachmentSummaries(samplePosts[1]?.attachments ?? []);
    expect(directPhotoAttachments).toEqual([
      { type: "photo", url: "https://scontent-ord5-2.xx.fbcdn.net/v/t39.30808-6/701206196_2496083044180284_7068436594735972564_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=102&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=Rw6Y8KeSI8gQ7kNvwFnDmr-&_nc_oc=Adofg2LqUrCN_sUJ4nCb1r-VBYcnRZlcBBAzdZ9AWHNIzWKp-kIz1mqm97odKLsV6J4&_nc_zt=23&_nc_ht=scontent-ord5-2.xx&_nc_gid=McmaMDkc5UHNGxmr7bPPrw&_nc_ss=7d289&oh=00_Af7jwg7KmU0YSNBYmNfnP5YVi7UkoknKFsAUviVhizJvGA&oe=6A125092" },
      { type: "photo", url: "https://scontent-ord5-2.xx.fbcdn.net/v/t39.30808-6/701273381_2496083107513611_755751670934727265_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=111&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=a-LuFqYoK9sQ7kNvwFa4pcG&_nc_oc=Adqf91IEQzSt0Ufy97o9HHhGXf-glFivpSGSGxKuMFnszZONRcv_KaVwEk1pvB6vLmQ&_nc_zt=23&_nc_ht=scontent-ord5-2.xx&_nc_gid=McmaMDkc5UHNGxmr7bPPrw&_nc_ss=7d289&oh=00_Af4Uj6xHZHCOeaMocO9zNUv4ySL8XXModIjkmIeQf-C0hw&oe=6A124785" },
      { type: "photo", url: "https://scontent-ord5-1.xx.fbcdn.net/v/t39.30808-6/701254391_2496083027513619_2370518600732608587_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=106&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=suhzxEpEVMEQ7kNvwGj0go2&_nc_oc=AdofMfCspXvzlpR5bVIv4I2eNQSmvn6HYAD-nTtcAbw_1nuBAK83FzfpG4XavPb0wvo&_nc_zt=23&_nc_ht=scontent-ord5-1.xx&_nc_gid=McmaMDkc5UHNGxmr7bPPrw&_nc_ss=7d289&oh=00_Af7jF78ppAJIf7yFDoHaNATCE5cgihignMhY67yEcFMFhg&oe=6A1250A7" },
      { type: "photo", url: "https://scontent-ord5-2.xx.fbcdn.net/v/t39.30808-6/701465689_2496083117513610_7651297169813888944_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=104&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=DLDFZ8Jc46QQ7kNvwEh3VMr&_nc_oc=AdrOpcPgAlPn29QVNAhW1fuvdG4FxzCMR48dgx5_UsV94KaS5qQRi6dKKvHgolXAMvg&_nc_zt=23&_nc_ht=scontent-ord5-2.xx&_nc_gid=McmaMDkc5UHNGxmr7bPPrw&_nc_ss=7d289&oh=00_Af6PDv8Gl-xinWO7h-UBL7BDVA9Gf0Dkgv_QikS5rERa9w&oe=6A122D10" },
      { type: "photo", url: "https://scontent-ord5-2.xx.fbcdn.net/v/t39.30808-6/701480410_2496083134180275_2876291591770902681_n.jpg?stp=dst-jpg_s590x590_tt6&_nc_cat=103&ccb=1-7&_nc_sid=aa7b47&_nc_ohc=W2-kG0VaHHYQ7kNvwFJqueG&_nc_oc=AdpZ2mU3UY52fvSxMbI_i9hERE2k0GcoElvjZmJJXT7MHfSrmcOUnWY8BbwsAA6WrgE&_nc_zt=23&_nc_ht=scontent-ord5-2.xx&_nc_gid=McmaMDkc5UHNGxmr7bPPrw&_nc_ss=7d289&oh=00_Af6M9w8LrYPVa0J_6rHhlBb45rZrMXMKjJ96rOsArIL_dg&oe=6A1246E4" }
    ]);
  });
});
