import type { ParsedAttachmentMediaKey, RentalInfoStore } from "./aws-clients";
import { buildPublicS3Url } from "./aws-clients";

export type UpdateAttachmentMetadataResult = {
  updated: number;
  skipped: number;
  failed: number;
};

export type UpdateAttachmentMetadataServiceConfig = {
  bucketName: string;
  awsRegion: string;
};

export class UpdateAttachmentMetadataService {
  constructor(
    private readonly rentalInfoStore: RentalInfoStore,
    private readonly config: UpdateAttachmentMetadataServiceConfig
  ) {}

  async processMirroredObject(
    parsed: ParsedAttachmentMediaKey,
    s3Key: string
  ): Promise<UpdateAttachmentMetadataResult> {
    const result: UpdateAttachmentMetadataResult = { updated: 0, skipped: 0, failed: 0 };
    const publicUrl = buildPublicS3Url(this.config.bucketName, this.config.awsRegion, s3Key);

    try {
      await this.rentalInfoStore.updateAttachmentUrl(parsed.region, parsed.id, parsed.index, publicUrl);
      result.updated += 1;
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      if (errorName === "ConditionalCheckFailedException") {
        result.skipped += 1;
        return result;
      }

      console.warn("listing attachment url update failed", {
        region: parsed.region,
        listingId: parsed.id,
        attachmentIndex: parsed.index,
        publicUrl,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
      result.failed += 1;
    }

    return result;
  }
}
