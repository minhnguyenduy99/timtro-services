import { describe, expect, it } from "vitest";

import { downloadAttachmentMessageSchema } from "../../src/domain/schemas";

describe("download attachment message schema", () => {
  const validMessage = {
    region: "ho_chi_minh_district_1",
    id: "fb_post"
  };

  it("parses a valid message with rental listing keys only", () => {
    expect(downloadAttachmentMessageSchema.parse(validMessage)).toEqual(validMessage);
  });

  it("rejects missing region", () => {
    expect(() => downloadAttachmentMessageSchema.parse({ id: "fb_post" })).toThrow();
  });

  it("rejects missing id", () => {
    expect(() => downloadAttachmentMessageSchema.parse({ region: "ho_chi_minh_district_1" })).toThrow();
  });
});
