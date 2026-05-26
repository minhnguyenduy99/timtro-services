import { defineConfig } from "vite";

const handler = process.env.TIMTRO_CRAWLER_HANDLER ?? "";
const handlerEntries = {
  crawl: "src/handlers/crawl.handler.ts",
  sanitize: "src/handlers/sanitize.handler.ts",
  "download-attachment": "src/handlers/download-attachment.handler.ts",
  "update-attachment-metadata": "src/handlers/update-attachment-metadata.handler.ts"
} as const;

type CrawlerHandler = keyof typeof handlerEntries;

if (!(handler in handlerEntries)) {
  throw new Error(
    "TIMTRO_CRAWLER_HANDLER must be one of: crawl, sanitize, download-attachment, update-attachment-metadata"
  );
}

const crawlerHandler = handler as CrawlerHandler;

const awsSdkExternals = [
  "@aws-sdk/client-dynamodb",
  "@aws-sdk/client-s3",
  "@aws-sdk/client-sqs",
  "@aws-sdk/lib-dynamodb"
];

export default defineConfig({
  ssr: {
    external: awsSdkExternals,
    noExternal: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: crawlerHandler === "crawl",
    target: "node24",
    ssr: true,
    minify: true,
    rolldownOptions: {
      input: handlerEntries[crawlerHandler],
      external: awsSdkExternals,
      output: {
        entryFileNames: `${crawlerHandler}.mjs`,
        codeSplitting: false
      }
    }
  }
});
