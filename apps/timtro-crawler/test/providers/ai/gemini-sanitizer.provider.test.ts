import { describe, expect, it, vi } from "vitest";

import { mapApifyPostToRawPost } from "../../../src/domain/raw-rental-post";
import { AiProviderError } from "../../../src/providers/ai/ai-sanitizer.provider";
import type { GeminiClientLike } from "../../../src/providers/ai/gemini-sanitizer.provider";
import { GeminiSanitizerProvider } from "../../../src/providers/ai/gemini-sanitizer.provider";

const rawPost = mapApifyPostToRawPost({
  facebookId: "group-1",
  legacyId: "post-1",
  url: "https://facebook.com/post",
  time: "2026-05-19T00:00:00.000Z",
  text: "Cho thue phong tro quan 1",
  topComments: [{ commentId: "comment-1", commentUrl: "https://facebook.com/comment", text: "Phong rieng" }]
});

function clientReturning(value: unknown): GeminiClientLike {
  return {
    models: {
      generateContent: vi.fn(async () => ({
        text: JSON.stringify(value)
      }))
    }
  };
}

describe("GeminiSanitizerProvider", () => {
  it("returns valid post-level rental info from Gemini JSON", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: clientReturning({
        classification: "rental",
        rentals: [
          {
            sourcePostId: "post-1",
            address: "123 Nguyen Trai",
            city: "Ho Chi Minh",
            district: "District 1",
            title: "Phong tro Quan 1",
            postDate: "2026-05-19T00:00:00.000Z",
            timestamp: "2026-05-20T00:00:00.000Z",
            originalLink: "https://facebook.com/post",
            attachments: []
          }
        ]
      })
    });

    await expect(provider.sanitize(rawPost)).resolves.toMatchObject({
      kind: "rental_info",
      records: [{ id: "fb_post-1", originalLink: "https://facebook.com/post" }],
      metadata: { provider: "gemini", model: "gemini-test" }
    });
  });

  it("returns valid comment-derived rental info", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: clientReturning({
        classification: "rental",
        rentals: [
          {
            sourcePostId: "post-1",
            sourceCommentId: "comment-1",
            address: "456 Le Loi",
            city: "Ho Chi Minh",
            district: "District 3",
            title: "Phong rieng Quan 3",
            postDate: "2026-05-19T00:00:00.000Z",
            timestamp: "2026-05-20T00:00:00.000Z",
            originalLink: "https://facebook.com/comment",
            attachments: []
          }
        ]
      })
    });

    await expect(provider.sanitize(rawPost)).resolves.toMatchObject({
      records: [{ id: "fb_comment-1", originalLink: "https://facebook.com/comment" }]
    });
  });

  it("returns multiple valid candidates with deterministic ids", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: clientReturning({
        classification: "rental",
        rentals: [
          {
            sourcePostId: "post-1",
            address: "123 Nguyen Trai",
            city: "Ho Chi Minh",
            district: "District 1",
            title: "Phong tro Quan 1",
            postDate: "2026-05-19T00:00:00.000Z",
            timestamp: "2026-05-20T00:00:00.000Z",
            originalLink: "https://facebook.com/post",
            attachments: []
          },
          {
            sourcePostId: "post-1",
            sourceCommentId: "comment-1",
            address: "456 Le Loi",
            city: "Ho Chi Minh",
            district: "District 3",
            title: "Phong rieng Quan 3",
            postDate: "2026-05-19T00:00:00.000Z",
            timestamp: "2026-05-20T00:00:00.000Z",
            originalLink: "https://facebook.com/comment",
            attachments: []
          }
        ]
      })
    });

    await expect(provider.sanitize(rawPost)).resolves.toMatchObject({
      records: [{ id: "fb_post-1" }, { id: "fb_comment-1" }]
    });
  });

  it("omits attachments from the Gemini prompt to reduce token cost", async () => {
    const generateContent = vi.fn(async () => ({
      text: JSON.stringify({ classification: "non_rental", rentals: [] })
    }));
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: { models: { generateContent } }
    });

    await provider.sanitize({
      ...rawPost,
      rawPayload: { profileName: "Do not send", accessToken: "secret" },
      attachments: [{ type: "photo", url: "https://cdn.example.com/photo.jpg?token=secret#frag" }]
    });

    const calls = generateContent.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const request = calls[0]?.[0];
    expect(request).toMatchObject({
      model: "gemini-test",
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });
    const contents = String(request?.contents);
    expect(contents).not.toContain("cdn.example.com");
    expect(contents).not.toContain("attachments");
    expect(contents).not.toContain("token=secret");
    expect(contents).not.toContain("profileName");
    expect(contents).not.toContain("accessToken");
  });

  it("persists raw post attachment URLs instead of Gemini-returned URLs", async () => {
    const originalUrl =
      "https://scontent-hou1-1.xx.fbcdn.net/v/t39.30808-6/704810619_122113775865123546_5741936058581955408_n.jpg?oh=00_Af5fGpZFVELOwbLb7rGANSqq5vZ1pnJrQMN4laJUFX_19g&oe=6A17590B";
    const hallucinatedUrl =
      "https://scontent-lga3-1.xx.fbcdn.net/v/t39.30808-6/705394107_122113832691123546_4001698392742102439_n.jpg";
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: clientReturning({
        classification: "rental",
        rentals: [
          {
            sourcePostId: "post-1",
            address: "123 Nguyen Trai",
            city: "Ho Chi Minh",
            district: "District 1",
            title: "Phong tro Quan 1",
            postDate: "2026-05-19T00:00:00.000Z",
            timestamp: "2026-05-20T00:00:00.000Z",
            originalLink: "https://facebook.com/post",
            attachments: [{ type: "photo", url: hallucinatedUrl }]
          }
        ]
      })
    });

    await expect(
      provider.sanitize({
        ...rawPost,
        attachments: [{ type: "photo", url: originalUrl }]
      })
    ).resolves.toMatchObject({
      kind: "rental_info",
      records: [{ attachments: [{ type: "photo", url: originalUrl }] }]
    });
  });

  it("classifies non-rentals without treating them as infrastructure failures", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: clientReturning({ classification: "non_rental", rentals: [] })
    });

    await expect(provider.sanitize(rawPost)).resolves.toMatchObject({ kind: "non_rental", records: [] });
  });

  it("classifies invalid provider JSON as validation failure", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: {
        models: {
          generateContent: vi.fn(async () => ({ text: "{not json" }))
        }
      }
    });

    await expect(provider.sanitize(rawPost)).rejects.toMatchObject({ kind: "validation" });
  });

  it("classifies transient provider failures as retryable", async () => {
    const provider = new GeminiSanitizerProvider({
      apiKey: "key",
      model: "gemini-test",
      client: {
        models: {
          generateContent: vi.fn(async () => {
            throw new Error("timeout with sensitive provider details");
          })
        }
      }
    });

    await expect(provider.sanitize(rawPost)).rejects.toMatchObject({ kind: "retryable" });
  });

  it("fails fast when required Gemini configuration is missing", () => {
    expect(() => new GeminiSanitizerProvider({ apiKey: "", model: "gemini-test" })).toThrow(AiProviderError);
  });
});
