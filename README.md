# timtro-mcp

Nx + pnpm monorepo for **Timtro MCP** (Streamable HTTP on Vercel) and **timtro-crawler** (AWS SAM ingestion pipeline).

## timtro-mcp

Remote MCP server exposing rental search tools over **Streamable HTTP** at `/api/mcp`. Data comes from DynamoDB `RentalInfoTableV2` (written by the crawler).

```bash
corepack enable
pnpm install
pnpm dev          # vercel dev in apps/timtro-mcp
pnpm smoke        # HTTP smoke against localhost:3000
pnpm test
```

See [apps/timtro-mcp/README.md](apps/timtro-mcp/README.md) for deploy sequence (SAM IAM role → Vercel OIDC → Cursor config).

## timtro-crawler

AWS SAM stack: Apify crawl → SQS → Gemini sanitize → DynamoDB.

```bash
pnpm crawler:deploy
pnpm exec nx test timtro-crawler
```

Details: [apps/timtro-crawler/README.md](apps/timtro-crawler/README.md).

## Workspace layout

| Path | Role |
|------|------|
| `apps/timtro-mcp` | Vercel MCP server + SAM IAM stack |
| `apps/timtro-crawler` | Crawler Lambdas + DynamoDB tables |
| `libs/rental-info` | Shared schemas and area catalog |
