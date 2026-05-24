# timtro-mcp

Streamable HTTP MCP server for rental listings in TP.HCM. Reads `RentalInfoTableV2` on DynamoDB (populated by `timtro-crawler`) and exposes `get_areas` + `search_rentals` tools.

Deploy target: **AWS Lambda** behind **API Gateway HTTP API** at `/mcp`. DynamoDB access uses the Lambda execution role — no long-lived AWS keys in environment variables beyond the MCP API key.

## Local development

```bash
corepack enable
pnpm install
pnpm dev
```

This starts a local HTTP server at `http://localhost:3000/mcp` (same Web Standard handler as Lambda production).

Optional env (`.env` or shell):

| Variable | Purpose |
|----------|---------|
| `MCP_API_KEY` | Bearer token for HTTP auth. Unset in non-production → dev bypass. |
| `RENTAL_INFO_TABLE_NAME` | DynamoDB v2 table, e.g. `timtro-rental-info-v2-dev` |
| `AWS_REGION` | Default `ap-southeast-1` |
| `AWS_PROFILE` / access keys | Local AWS credentials for `search_rentals` |

Smoke test (server must be running on port 3000):

```bash
pnpm smoke
# CI-friendly (skip DynamoDB):
SKIP_SEARCH_RENTALS=1 pnpm smoke
```

### SAM local

Build the Lambda bundle, then run API Gateway locally:

```bash
pnpm nx build timtro-mcp
pnpm nx sam:local timtro-mcp
```

Create `env.local.json` (gitignored) with Lambda env overrides:

```json
{
  "McpFunction": {
    "RENTAL_INFO_TABLE_NAME": "timtro-rental-info-v2-dev",
    "MCP_API_KEY": "local-dev-key",
    "NODE_ENV": "production"
  }
}
```

Smoke against SAM local:

```bash
MCP_URL=http://127.0.0.1:3000/mcp MCP_API_KEY=local-dev-key SKIP_SEARCH_RENTALS=1 pnpm smoke
```

## Cursor / MCP client

HTTP transport with API key:

```json
{
  "mcpServers": {
    "timtro": {
      "url": "https://{api-id}.execute-api.ap-southeast-1.amazonaws.com/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_API_KEY>"
      }
    }
  }
}
```

Local:

```json
{
  "mcpServers": {
    "timtro": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

(`MCP_API_KEY` can be omitted locally when dev bypass is active.)

## Tools

| Tool | Description |
|------|-------------|
| `get_areas` | Static catalog of supported cities/districts (no AWS). |
| `search_rentals` | Query DynamoDB v2 by city + district, optional filters. |

Always call `get_areas` first for valid `city` / `district` codes.

## Deploy sequence

1. **Crawler stack** — ensure `RentalInfoTableV2` exists (`pnpm crawler:deploy`).
2. **MCP stack env** — copy `env.example.json` → `env.dev.json`, set `McpApiKey`, then:

   ```bash
   pnpm mcp:deploy
   # or: pnpm nx deploy timtro-mcp
   ```

3. **Stack output** — use `McpApiUrl` from CloudFormation outputs as the MCP client URL.
4. **Cursor** — point MCP config at the API Gateway URL + bearer token.

If migrating from the old IAM-only stack (`timtro-mcp-iam-*`), delete that stack manually after the new Lambda stack is healthy.

## Nx targets

| Target | Command |
|--------|---------|
| `build` | Vite bundle → `dist/lambda.mjs` |
| `dev:http` | Local Node HTTP server on `/mcp` |
| `test` | Unit tests |
| `smoke` | HTTP smoke script |
| `sam:validate` | Lint SAM template |
| `sam:local` | `sam local start-api` on port 3000 |
| `deploy` | Build + `sam deploy` |

## Security notes

- Lambda role: `DynamoDBReadPolicy` on the rental info table only.
- Bearer API key validated in the handler (not at API Gateway).
- Do not log `Authorization` headers. Rotating `MCP_API_KEY` requires a stack redeploy with an updated parameter.
