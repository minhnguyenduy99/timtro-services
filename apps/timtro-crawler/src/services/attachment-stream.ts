import { Readable, Transform } from "node:stream";

import type { RentalAttachment } from "@timtro/rental-info";

export const DEFAULT_MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const DEFAULT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export class AttachmentTooLargeError extends Error {
  readonly name = "AttachmentTooLargeError";

  constructor(readonly maxBytes: number) {
    super(`attachment exceeds ${maxBytes} bytes`);
  }
}

export function maxAttachmentBytes(
  type: RentalAttachment["type"],
  options: { maxPhotoBytes?: number; maxVideoBytes?: number } = {}
): number {
  if (type === "video") {
    return options.maxVideoBytes ?? DEFAULT_MAX_VIDEO_BYTES;
  }
  return options.maxPhotoBytes ?? DEFAULT_MAX_PHOTO_BYTES;
}

export function webReadableToNodeReadable(body: ReadableStream<Uint8Array>): Readable {
  const reader = body.getReader();

  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        this.push(Buffer.from(value));
      } catch (error) {
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    },
    destroy(error, callback) {
      void reader.cancel().finally(() => callback(error));
    }
  });
}

export function nodeReadableFromBuffer(buffer: Uint8Array): Readable {
  return Readable.from([buffer]);
}

export function limitReadableByteCount(source: Readable, maxBytes: number): Readable {
  let total = 0;

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxBytes) {
        callback(new AttachmentTooLargeError(maxBytes));
        return;
      }
      callback(null, chunk);
    }
  });

  source.on("error", (error) => limiter.destroy(error));
  return source.pipe(limiter);
}

export async function readReadableToUint8Array(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}
