# Local SAM Events

`crawl-schedule.json` mimics the EventBridge Scheduler event for `CrawlFunction`.

`sanitize-sqs.json` mimics the SQS event source mapping for `SanitizeFunction`. The body contains only the raw post id, content hash, crawl run id, and source identity required for idempotent processing.

Use `env.local.json` for local invokes (copy from `env.local.example.json`):

```bash
cp env.local.example.json env.local.json
pnpm nx crawl:watch timtro-crawler
pnpm nx crawl:invoke timtro-crawler
```

Put CloudFormation values under `Parameters`. Put `RAW_RENTAL_POSTS_TABLE_NAME`, `RENTAL_INFO_TABLE_NAME`, and `SANITIZATION_QUEUE_URL` under `CrawlFunction` / `SanitizeFunction` so `--env-vars` overrides SAM local's unresolved `!Ref` values.

Set `GeminiDataProcessingApproved` to `"true"` so `SanitizeFunction` is included in the template during local invoke.
