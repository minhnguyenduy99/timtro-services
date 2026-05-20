import { defineConfig } from "vite";

const handler = process.env.TIMTRO_CRAWLER_HANDLER;
const handlerEntries = {
  crawl: "src/handlers/crawl.handler.ts",
  sanitize: "src/handlers/sanitize.handler.ts"
} as const;

if (handler !== "crawl" && handler !== "sanitize") {
  throw new Error("TIMTRO_CRAWLER_HANDLER must be set to either 'crawl' or 'sanitize'");
}

const awsSdkExternals = [
  "@aws-sdk/client-dynamodb",
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
    emptyOutDir: handler === "crawl",
    target: "node24",
    ssr: true,
    minify: true,
    rolldownOptions: {
      input: handlerEntries[handler],
      external: awsSdkExternals,
      output: {
        entryFileNames: `${handler}.mjs`,
        codeSplitting: false
      }
    }
  }
});
