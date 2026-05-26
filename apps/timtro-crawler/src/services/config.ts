function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optionalEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  if (!value || value.length === 0) {
    return undefined;
  }
  return value;
}

function optionalCsv(name: string, env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export type CrawlerConfig = {
  rawRentalPostsTableName: string;
  rentalInfoTableName: string;
  sanitizationQueueUrl: string;
  downloadAttachmentQueueUrl?: string;
  attachmentMediaBucketName?: string;
  apifyActorId: string;
  facebookGroupUrls: string[];
  apifyToken?: string;
  geminiApiKey?: string;
  geminiModel: string;
  awsRegion?: string;
  useFakeProviders: boolean;
  enqueueSanitization: boolean;
  enqueueDownloadAttachment: boolean;
};

export function loadCrawlerConfig(env: NodeJS.ProcessEnv = process.env): CrawlerConfig {
  const useFakeProviders = env.TIMTRO_USE_FAKE_PROVIDERS === "true";
  const enqueueSanitization =
    env.TIMTRO_ENQUEUE_SANITIZATION !== "false" && !useFakeProviders;
  const enqueueDownloadAttachment =
    env.TIMTRO_ENQUEUE_DOWNLOAD_ATTACHMENT !== "false" && !useFakeProviders;

  return {
    rawRentalPostsTableName: requireEnv("RAW_RENTAL_POSTS_TABLE_NAME", env),
    rentalInfoTableName: requireEnv("RENTAL_INFO_TABLE_NAME", env),
    sanitizationQueueUrl: requireEnv("SANITIZATION_QUEUE_URL", env),
    downloadAttachmentQueueUrl: optionalEnv("DOWNLOAD_ATTACHMENT_QUEUE_URL", env),
    attachmentMediaBucketName: optionalEnv("ATTACHMENT_MEDIA_BUCKET_NAME", env),
    apifyActorId: requireEnv("APIFY_ACTOR_ID", env),
    facebookGroupUrls: optionalCsv("FACEBOOK_GROUP_URLS", env),
    apifyToken: useFakeProviders ? optionalEnv("APIFY_TOKEN", env) : requireEnv("APIFY_TOKEN", env),
    geminiApiKey: useFakeProviders ? optionalEnv("GEMINI_API_KEY", env) : requireEnv("GEMINI_API_KEY", env),
    geminiModel: env.GEMINI_MODEL ?? "gemini-2.5-flash",
    awsRegion: optionalEnv("AWS_REGION", env),
    useFakeProviders,
    enqueueSanitization,
    enqueueDownloadAttachment
  };
}
