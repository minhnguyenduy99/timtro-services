# timtro-crawler

AWS SAM service that crawls Facebook rental posts through Apify, stores raw evidence in DynamoDB, and queues Gemini-backed sanitization into normalized rental records.

## Configuration

Required non-secret environment variables:

- `RAW_RENTAL_POSTS_TABLE_NAME`: DynamoDB table for raw Facebook post evidence.
- `RENTAL_INFO_TABLE_NAME`: DynamoDB table for normalized rental info keyed by `region` and `id`.
- `SANITIZATION_QUEUE_URL`: SQS queue URL for raw post sanitization messages.
- `APIFY_ACTOR_ID`: Apify actor id for the Facebook group crawler.
- `FACEBOOK_GROUP_URLS`: Comma-separated Facebook group URLs to crawl.
- `GEMINI_MODEL`: Gemini model name, defaulting to `gemini-2.5-flash`.
- `ENVIRONMENT_NAME`: Deployment environment label.
- `LOG_LEVEL`: Operational log level.
- `TIMTRO_USE_FAKE_PROVIDERS`: Set to `true` for offline local debugging.
- `DYNAMODB_ENDPOINT`, `SQS_ENDPOINT`: Optional LocalStack endpoints for SAM local debugging.

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
pnpm nx sam:local:crawl timtro-crawler
pnpm nx sam:local:sanitize timtro-crawler
```

Those targets read `template.yaml` directly and pass `--env-vars env.dev.json` plus CloudFormation parameter overrides derived from that file.

For offline local debugging, keep `TimtroUseFakeProviders=true` in `env.dev.json` and point DynamoDB/SQS clients at LocalStack through the function-level `DYNAMODB_ENDPOINT` and `SQS_ENDPOINT` overrides. Use real Apify or Gemini credentials only when intentionally testing live provider behavior.

## Process Status

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
