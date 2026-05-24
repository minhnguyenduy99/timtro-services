# timtro-mcp

Nx + pnpm monorepo for **Timtro MCP** (Streamable HTTP on AWS Lambda) and **timtro-crawler** (AWS SAM ingestion pipeline).

## timtro-mcp

Remote MCP server exposing rental search tools over **Streamable HTTP** at `/mcp`. Data comes from DynamoDB `RentalInfoTableV2` (written by the crawler).

```bash
corepack enable
pnpm install
pnpm dev          # local HTTP server in apps/timtro-mcp
pnpm smoke        # HTTP smoke against localhost:3000
pnpm test
```

See [apps/timtro-mcp/README.md](apps/timtro-mcp/README.md) for deploy sequence (build → SAM deploy → Cursor config).

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
| `apps/timtro-mcp` | MCP Lambda + HTTP API stack |
| `apps/timtro-crawler` | Crawler Lambdas + DynamoDB tables |
| `libs/rental-info` | Shared schemas and area catalog |
