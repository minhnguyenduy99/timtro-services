import { createHash } from "node:crypto";

import type { RentalAttachment } from "./rental-info";

export type ProcessStatus = "pending" | "completed" | "fail";

export type ProcessError = {
  category: string;
  message: string;
  code?: string;
  provider?: string;
  retryable: boolean;
  timestamp: string;
};

export type RawRentalComment = {
  commentId: string;
  text?: string;
  url?: string;
  timestamp?: string;
};

export type RawRentalPost = {
  id: string;
  source: "fb";
  groupId: string;
  postId: string;
  url?: string;
  postedAt?: string;
  text?: string;
  attachments: RentalAttachment[];
  comments: RawRentalComment[];
  contentHash: string;
  expiresAt: number;
  processStatus: ProcessStatus;
  processError?: ProcessError;
  sanitizedCount?: number;
  crawlRunId?: string;
  createdAt: string;
  updatedAt: string;
  rawPayload: unknown;
};

export type ApifyFacebookComment = {
  commentId?: string;
  commentUrl?: string;
  text?: string;
  commentText?: string;
  time?: string;
  timestamp?: string;
};

export type ApifyFacebookPost = {
  id?: string;
  facebookId?: string;
  legacyId?: string;
  url?: string;
  time?: string;
  text?: string;
  caption?: string;
  message?: string;
  attachments?: unknown[];
  topComments?: ApifyFacebookComment[];
};

export function buildRawPostId(groupId: string, postId: string): string {
  return `fb_${groupId}_${postId}`;
}

export function isRawRentalPost(value: unknown): value is RawRentalPost {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.source === "fb" &&
    typeof value.groupId === "string" &&
    typeof value.postId === "string" &&
    typeof value.contentHash === "string" &&
    typeof value.expiresAt === "number" &&
    (value.processStatus === "pending" || value.processStatus === "completed" || value.processStatus === "fail")
  );
}

export function extractFacebookPostIdentity(post: ApifyFacebookPost): { groupId: string; postId: string } {
  const groupId = requiredIdentityPart(post.facebookId, "facebookId");
  const postId = requiredIdentityPart(post.legacyId ?? post.id, "legacyId or id");
  return { groupId, postId };
}

export function extractPostText(post: ApifyFacebookPost): string | undefined {
  return firstNonEmpty(post.text, post.caption, post.message);
}

export function mapApifyPostToRawPost(post: ApifyFacebookPost, crawlRunId?: string, now = new Date()): RawRentalPost {
  const { groupId, postId } = extractFacebookPostIdentity(post);
  const comments = (post.topComments ?? [])
    .filter((comment) => typeof comment.commentId === "string" && comment.commentId.trim().length > 0)
    .map((comment) => ({
      commentId: comment.commentId as string,
      text: firstNonEmpty(comment.text, comment.commentText),
      url: comment.commentUrl,
      timestamp: comment.time ?? comment.timestamp
    }));
  const attachments = extractAttachmentSummaries(post.attachments ?? []);
  const contentHash = computeRawPostContentHash({ ...post, attachments, comments });
  const timestamp = now.toISOString();
  const retentionSeconds = 30 * 24 * 60 * 60;

  return {
    id: buildRawPostId(groupId, postId),
    source: "fb",
    groupId,
    postId,
    url: post.url,
    postedAt: post.time,
    text: extractPostText(post),
    attachments,
    comments,
    contentHash,
    expiresAt: Math.floor(now.getTime() / 1000) + retentionSeconds,
    processStatus: "pending",
    crawlRunId,
    createdAt: timestamp,
    updatedAt: timestamp,
    rawPayload: minimizeRawPayload(post)
  };
}

export function computeRawPostContentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function extractAttachmentSummaries(attachments: unknown[]): RentalAttachment[] {
  const seenUrls = new Set<string>();
  const summaries: RentalAttachment[] = [];

  for (const attachment of attachments) {
    collectAttachmentSummaries(attachment, summaries, seenUrls);
  }

  return summaries;
}

function collectAttachmentSummaries(
  value: unknown,
  summaries: RentalAttachment[],
  seenUrls: Set<string>
): void {
  if (!isRecord(value)) {
    return;
  }

  const mediaType = String(value.type ?? value.mediaType ?? value.__typename ?? "").toLowerCase();
  const url = extractAttachmentUrl(value);

  if (url && !isFacebookMediaSetUrl(url) && !seenUrls.has(url)) {
    seenUrls.add(url);
    summaries.push({
      type: mediaType.includes("video") || mediaType.includes("reel") ? "video" : "photo",
      url
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.endsWith("_subattachments") && isRecord(child) && Array.isArray(child.nodes)) {
      for (const node of child.nodes) {
        collectAttachmentSummaries(node, summaries, seenUrls);
      }
    }
  }

  if (isRecord(value.media)) {
    collectAttachmentSummaries(value.media, summaries, seenUrls);
  }
}

function extractAttachmentUrl(attachment: Record<string, unknown>): string | undefined {
  return firstString(
    nestedString(attachment, "viewer_image", "uri"),
    nestedString(attachment, "viewer_image", "url"),
    nestedString(attachment, "media", "viewer_image", "uri"),
    nestedString(attachment, "media", "viewer_image", "url"),
    nestedString(attachment, "image", "uri"),
    nestedString(attachment, "image", "url"),
    nestedString(attachment, "media", "image", "uri"),
    nestedString(attachment, "media", "image", "url"),
    typeof attachment.thumbnail === "string" ? attachment.thumbnail : undefined,
    nestedString(attachment, "thumbnail", "uri"),
    nestedString(attachment, "thumbnail", "url"),
    attachment.url,
    attachment.href,
    attachment.fullImageUrl,
    attachment.fullPicture
  );
}

function isFacebookMediaSetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("facebook.com") && parsed.pathname.includes("/media/set/");
  } catch {
    return false;
  }
}

function requiredIdentityPart(value: string | undefined, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing Facebook ${label}`);
  }
  return value.trim();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function nestedString(value: Record<string, unknown>, ...path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function minimizeRawPayload(post: ApifyFacebookPost): Record<string, unknown> {
  return {
    id: post.id,
    facebookId: post.facebookId,
    legacyId: post.legacyId,
    url: post.url,
    time: post.time,
    text: extractPostText(post),
    attachmentCount: post.attachments?.length ?? 0,
    commentCount: post.topComments?.length ?? 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
