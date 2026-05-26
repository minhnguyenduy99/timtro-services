import type { Readable } from "node:stream";

import type { RentalAttachment } from "@timtro/rental-info";

import type { DownloadAttachmentMessage } from "../domain/download-attachment-message";
import {
  AttachmentTooLargeError,
  limitReadableByteCount,
  maxAttachmentBytes
} from "./attachment-stream";
import { buildAttachmentMediaKey, isMirroredAttachmentUrl, type RentalInfoStore, type S3MediaStore } from "./aws-clients";

export type DownloadAttachmentResult =
  | { outcome: "completed"; attachmentCount: number }
  | { outcome: "skipped"; reason: "missing_listing" | "no_attachments" }
  | { outcome: "retry"; reason: string };

export type HttpFetchSuccess = {
  ok: true;
  status: number;
  contentType: string | null;
  contentLength: number | undefined;
  body: Readable;
};

export type HttpFetchFailure = {
  ok: false;
  status: number;
  contentType: string | null;
};

export type HttpFetchResult = HttpFetchSuccess | HttpFetchFailure;

export type HttpFetcher = {
  fetch(url: string, init?: { signal?: AbortSignal }): Promise<HttpFetchResult>;
};

export type DownloadAttachmentServiceConfig = {
  attachmentMediaBucketName: string;
  awsRegion: string;
  fetchTimeoutMs?: number;
  maxPhotoBytes?: number;
  maxVideoBytes?: number;
};

export class DownloadAttachmentService {
  constructor(
    private readonly rentalInfoStore: RentalInfoStore,
    private readonly mediaStore: S3MediaStore,
    private readonly httpFetcher: HttpFetcher,
    private readonly config: DownloadAttachmentServiceConfig
  ) {}

  async process(message: DownloadAttachmentMessage): Promise<DownloadAttachmentResult> {
    const listing = await this.rentalInfoStore.get(message.region, message.id);
    if (!listing) {
      return { outcome: "skipped", reason: "missing_listing" };
    }

    if (listing.attachments.length === 0) {
      return { outcome: "skipped", reason: "no_attachments" };
    }

    const seenUrls = new Set<string>();
    let uploadedCount = 0;

    for (const [index, attachment] of listing.attachments.entries()) {
      const dedupeKey = attachment.url.split("?")[0] ?? attachment.url;
      if (seenUrls.has(dedupeKey)) {
        continue;
      }
      seenUrls.add(dedupeKey);

      if (isMirroredAttachmentUrl(attachment.url, this.config.attachmentMediaBucketName, this.config.awsRegion)) {
        continue;
      }

      try {
        console.info("mirroring attachment", {
          region: message.region,
          listingId: message.id,
          sourcePostId: listing.sourcePostId,
          attachmentIndex: index,
          url: attachment.url
        });
        const uploaded = await this.mirrorAttachment(message.region, message.id, index, attachment);
        if (uploaded) {
          uploadedCount += 1;
        }
      } catch (error) {
        if (error instanceof AttachmentTooLargeError) {
          console.warn("attachment skipped because it exceeds size limit", {
            region: message.region,
            listingId: message.id,
            attachmentIndex: index,
            url: attachment.url,
            maxBytes: error.maxBytes
          });
          continue;
        }

        console.warn("attachment mirror failed", {
          region: message.region,
          listingId: message.id,
          attachmentIndex: index,
          url: attachment.url,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
        });

        return {
          outcome: "retry",
          reason: error instanceof Error ? `${error.name}: ${error.message}` : "download_error"
        };
      }
    }

    return { outcome: "completed", attachmentCount: uploadedCount };
  }

  private async mirrorAttachment(
    region: string,
    listingId: string,
    index: number,
    attachment: RentalAttachment
  ): Promise<boolean> {
    const downloaded = await this.downloadAttachment(attachment.url);
    if (!downloaded.ok) {
      throw new DownloadFailedError(downloaded.status);
    }

    const maxBytes = maxAttachmentBytes(attachment.type, this.config);
    if (downloaded.contentLength !== undefined && downloaded.contentLength > maxBytes) {
      throw new AttachmentTooLargeError(maxBytes);
    }

    const extension = extensionFromContentType(downloaded.contentType, attachment.url);
    const s3Key = buildAttachmentMediaKey(region, listingId, index, extension);
    const limitedBody = limitReadableByteCount(downloaded.body, maxBytes);

    await this.mediaStore.putObjectStream(
      s3Key,
      limitedBody,
      downloaded.contentType ?? "application/octet-stream"
    );

    return true;
  }

  private async downloadAttachment(url: string): Promise<HttpFetchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs ?? 60_000);
    try {
      return await this.httpFetcher.fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

class DownloadFailedError extends Error {
  readonly name = "DownloadFailedError";

  constructor(readonly status: number) {
    super(`download_failed_${status}`);
  }
}

export function dedupeAttachments(attachments: RentalAttachment[]): RentalAttachment[] {
  const seen = new Set<string>();
  const result: RentalAttachment[] = [];

  for (const attachment of attachments) {
    const key = attachment.url.split("?")[0] ?? attachment.url;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(attachment);
  }

  return result;
}

export function extensionFromContentType(contentType: string | null, url: string): string {
  const normalized = contentType?.toLowerCase() ?? "";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return "jpg";
  }
  if (normalized.includes("png")) {
    return "png";
  }
  if (normalized.includes("webp")) {
    return "webp";
  }
  if (normalized.includes("mp4")) {
    return "mp4";
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  } catch {
    // fall through
  }

  return "bin";
}
