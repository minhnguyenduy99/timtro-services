# Local SAM Events

`crawl-schedule.json` mimics the EventBridge Scheduler event for `CrawlFunction`.

`sanitize-sqs.json` mimics the SQS event source mapping for `SanitizeFunction`. The body contains only the raw post id, content hash, crawl run id, and source identity required for idempotent processing.

Use fake providers for local offline invokes via `env.dev.json`:

```bash
cp env.example.json env.dev.json
pnpm nx crawl:watch timtro-crawler
pnpm nx sam:local:crawl timtro-crawler
```

Set `GeminiDataProcessingApproved` to `"true"` in `env.dev.json` so `SanitizeFunction` is included in the SAM template during local invoke.

When using LocalStack, set `DYNAMODB_ENDPOINT` and `SQS_ENDPOINT` in the function sections of `env.dev.json`. Keep real API tokens outside the repository.
