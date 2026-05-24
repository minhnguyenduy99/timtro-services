# timtro-crawler

AWS SAM service that crawls Facebook rental posts through Apify, stores raw evidence in DynamoDB, and queues Gemini-backed sanitization into normalized rental records.

## Configuration

Required non-secret environment variables:

- `RAW_RENTAL_POSTS_TABLE_NAME`: DynamoDB table for raw Facebook post evidence.
- `RENTAL_INFO_TABLE_NAME`: DynamoDB table for normalized rental info keyed by `region` and `id`. After v2 cutover this points to `timtro-rental-info-v2-{env}` (LSIs on `postDate` and `price` for MCP search).
- `SANITIZATION_QUEUE_URL`: SQS queue URL for raw post sanitization messages.
- `APIFY_ACTOR_ID`: Apify actor id for the Facebook group crawler.
- `FACEBOOK_GROUP_URLS`: Comma-separated Facebook group URLs to crawl.
- `GEMINI_MODEL`: Gemini model name, defaulting to `gemini-2.5-flash`.
- `ENVIRONMENT_NAME`: Deployment environment label.
- `LOG_LEVEL`: Operational log level.
- `TIMTRO_USE_FAKE_PROVIDERS`: Set to `true` for offline local debugging.
- `TIMTRO_ENQUEUE_SANITIZATION`: Set to `false` on `CrawlFunction` during local crawl-only invokes to keep raw posts `pending` until you manually run `sanitize:invoke`. Automatically disabled when `TIMTRO_USE_FAKE_PROVIDERS=true`.

Required provider credentials (Lambda environment variables, `NoEcho` in CloudFormation):

- `APIFY_TOKEN`: Apify API token.
- `GEMINI_API_KEY`: Gemini API key.

Do not commit secret values. Copy `env.example.json` to `env.dev.json`, fill in your local values, and keep `env.dev.json` out of git.

## Local Development

Run app tests with the crawler-scoped Nx target:

```bash
pnpm nx test timtro-crawler
```

Copy the sample env file and adjust values for your machine:

```bash
cp env.example.json env.dev.json
```

Build handlers once, or keep a watch running while you iterate:

```bash
pnpm nx crawl:watch timtro-crawler
# or
pnpm nx sanitize:watch timtro-crawler
```

In another terminal, invoke SAM local against the prebuilt `dist/` output. No `sam build` step is required because the template uses `SkipBuild: true`.

```bash
cp env.local.example.json env.local.json   # edit table names / queue URL for your AWS account
pnpm nx crawl:invoke timtro-crawler
pnpm nx sanitize:invoke timtro-crawler
```

`sam local invoke` uses two mechanisms from `env.local.json`:

| Section | SAM flag | Purpose |
|---------|----------|---------|
| `Parameters` | `--parameter-overrides` | CloudFormation template parameters only (`ApifyActorId`, `TimtroUseFakeProviders`, …) |
| `CrawlFunction` / `SanitizeFunction` | `--env-vars` | Lambda runtime env overrides (`RAW_RENTAL_POSTS_TABLE_NAME`, `SANITIZATION_QUEUE_URL`, …) |

SAM local does not resolve `!Ref` on DynamoDB/SQS to real names (you may see `RawRentalPostsTable` instead). Put actual table names and queue URLs under the function sections. Deployed Lambdas still get those values from `template.yaml` `!Ref` automatically.

For offline debugging with fake providers only, `TimtroUseFakeProviders=true` is enough for a smoke invoke. To hit real DynamoDB/SQS locally, set the function env vars to resources in your account.

## Deploy

`samconfig.toml` defines per-environment SAM defaults (`dev`, `staging`, `prod`). Build handlers first, then deploy.

**CloudFormation parameters** (template `Parameters:`) come from `env.dev.json` → `Parameters` via `--parameter-overrides`. `sam deploy` does not read `--env-vars`; that flag is only for `sam local invoke`.

```bash
pnpm nx build timtro-crawler
cd apps/timtro-crawler
sam deploy --config-env dev \
  --parameter-overrides "$(node scripts/format-sam-parameter-overrides.mjs env.dev.json)"
```

Production deploy from CI uses `--config-env prod` and passes secrets via `--parameter-overrides` from GitHub variables.

```bash
pnpm nx deploy timtro-crawler
```

That Nx target runs `sam deploy --config-env dev` with parameters from `env.dev.json`. For prod, use `--config-env prod` and pass `--parameter-overrides` (or set `s3_bucket` in `samconfig.toml`).

## Migrate rental info v1 → v2

After deploying `RentalInfoTableV2`, backfill historical listings from the legacy table with:

```bash
# Dry run (scan + validate only)
ENVIRONMENT_NAME=dev AWS_PROFILE=your-profile pnpm crawler:migrate-rental-info-v2 -- --dry-run

# Copy all rows
ENVIRONMENT_NAME=dev AWS_PROFILE=your-profile pnpm crawler:migrate-rental-info-v2
```

Defaults:

- **Source:** `timtro-rental-info-{ENVIRONMENT_NAME}` (v1)
- **Dest:** `timtro-rental-info-v2-{ENVIRONMENT_NAME}` (v2)

Override with env vars or flags:

- `RENTAL_INFO_SOURCE_TABLE_NAME` / `--source`
- `RENTAL_INFO_TABLE_NAME` / `--dest`
- `--limit N` — migrate only the first N scanned rows (testing)
- `--dry-run` — no writes

The script scans v1, validates each row with `@timtro/rental-info`, and batch-writes to v2 (`PutItem` semantics — safe to re-run). Invalid rows are skipped with a warning.

## Process Status

Raw posts are always written by the crawl Lambda with `processStatus = pending`. Only the sanitize Lambda may transition a raw post to `completed` or `fail` after it processes the SQS message. If you invoke crawl locally against real DynamoDB and SQS, the deployed sanitize Lambda can finish within seconds and update the same record before you inspect it.

- `pending`: Raw post evidence is stored and waiting for sanitization, or a transient retry is still owned by SQS.
- `completed`: Sanitization ran successfully. `sanitizedCount=0` means the post was confidently classified as non-rental.
- `fail`: Terminal validation/configuration failure. `processError` stores redacted category, provider, retryability, and timestamp metadata, never raw text, prompts, provider responses, secrets, or token-bearing URLs.

## Replay

Replay starts from raw records, not Apify. For a raw post stuck in `pending` or `fail`, inspect its `id` and `contentHash`, then re-enqueue a sanitization message with:

- `rawPostId`
- `contentHash`
- `source`
- `groupId`
- `postId`
- optional `crawlRunId`

Stale messages whose `contentHash` no longer matches the raw record are acknowledged without AI spend. Duplicate delivery after completion is also acknowledged without another provider call.

## Data Handling

Raw Facebook text/comments and AI inputs are sensitive user-generated content. The service stores raw evidence for replay, minimizes Gemini payloads to listing-relevant fields, uses redacted logging, enables encryption on queues/tables, and requires `GEMINI_DATA_PROCESSING_APPROVED=true` before production deployment.

## CI/CD

`.github/workflows/timtro-crawler.yml` runs crawler-scoped tests, Vite build, and SAM validation. Production deploy uses GitHub OIDC and requires these repository or environment variables:

- `AWS_REGION`
- `AWS_DEPLOY_ROLE_ARN`
- `TIMTRO_CRAWLER_STACK_NAME`
- `TIMTRO_CRAWLER_ENVIRONMENT`
- `SAM_DEPLOY_BUCKET`
- `GEMINI_DATA_PROCESSING_APPROVED`
- `APIFY_ACTOR_ID`
- `FACEBOOK_GROUP_URLS`
- `APIFY_TOKEN`
- `GEMINI_API_KEY`

OIDC trust should be restricted by branch and environment. The deployment role should be least-privilege for CloudFormation/SAM, Lambda, DynamoDB, SQS, and Logs resources used by this stack.
