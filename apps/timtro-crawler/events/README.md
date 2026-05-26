# Local SAM Events

`crawl-schedule.json` mimics the EventBridge Scheduler event for `CrawlFunction`.

`sanitize-sqs.json` mimics the SQS event source mapping for `SanitizeFunction`. The body contains only the raw post id, content hash, crawl run id, and source identity required for idempotent processing.

Use `env.local.json` for local invokes (copy from `env.local.example.json`):

```bash
cp env.local.example.json env.local.json
pnpm nx crawl:watch timtro-crawler
pnpm nx crawl:invoke timtro-crawler
```

Put CloudFormation values and Lambda runtime overrides in `env.local.json` so `--env-vars` overrides SAM local's unresolved `!Ref` values.
