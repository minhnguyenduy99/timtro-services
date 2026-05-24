# timtro-mcp

Streamable HTTP MCP server for rental listings in TP.HCM. Reads `RentalInfoTableV2` on DynamoDB (populated by `timtro-crawler`) and exposes `get_areas` + `search_rentals` tools.

Deploy target: **Vercel** (serverless `/api/mcp`). AWS access uses a **SAM IAM role** assumed via **Vercel OIDC** — no long-lived AWS keys in Vercel env.

## Local development

```bash
corepack enable
pnpm install
cd apps/timtro-mcp
vercel dev
```

Optional env (`.env` or shell):

| Variable | Purpose |
|----------|---------|
| `MCP_API_KEY` | Bearer token for HTTP auth. Unset in non-production → dev bypass. |
| `RENTAL_INFO_TABLE_NAME` | DynamoDB v2 table, e.g. `timtro-rental-info-v2-dev` |
| `AWS_REGION` | Default `ap-southeast-1` |
| `AWS_PROFILE` / access keys | Local AWS credentials when `AWS_ROLE_ARN` is unset |

Smoke test (server must be running on port 3000):

```bash
pnpm smoke
# CI-friendly (skip DynamoDB):
SKIP_SEARCH_RENTALS=1 pnpm smoke
```

## Cursor / MCP client

HTTP transport with API key:

```json
{
  "mcpServers": {
    "timtro": {
      "url": "https://<project>.vercel.app/api/mcp",
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
      "url": "http://localhost:3000/api/mcp"
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
2. **Vercel OIDC provider** (one-time per AWS account) — register `https://oidc.vercel.com/<TEAM_SLUG>` in IAM Identity Providers with audience `https://vercel.com/<TEAM_SLUG>`. See [Vercel AWS OIDC docs](https://vercel.com/docs/oidc/aws).
3. **MCP IAM stack** — copy `env.example.json` → `env.dev.json`, fill Vercel team/project slugs, then:

   ```bash
   pnpm mcp:deploy:iam
   # or: nx deploy:iam timtro-mcp
   ```

4. **Vercel env** — set on the Vercel project (Root Directory = `apps/timtro-mcp`):

   | Variable | Source |
   |----------|--------|
   | `MCP_API_KEY` | Generate a secret |
   | `AWS_ROLE_ARN` | SAM output `McpReadRoleArn` |
   | `AWS_REGION` | `ap-southeast-1` |
   | `RENTAL_INFO_TABLE_NAME` | SAM output or `timtro-rental-info-v2-dev` |

5. **Vercel deploy** — `vercel deploy` or connect Git repo.
6. **Cursor** — point MCP config at production URL + bearer token.

## Nx targets

| Target | Command |
|--------|---------|
| `dev:http` | `vercel dev` |
| `test` | Unit tests |
| `smoke` | HTTP smoke script |
| `sam:validate` | Lint SAM template |
| `deploy:iam` | Deploy IAM role stack |

## Security notes

- IAM role: `dynamodb:Query` + `DescribeTable` only; explicit deny on writes.
- Trust policy scopes Vercel OIDC `sub` to your team/project/environment.
- Do not log `Authorization` headers. Rotate `MCP_API_KEY` by updating Vercel env + client config.
