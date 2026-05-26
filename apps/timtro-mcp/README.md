# timtro-mcp

Streamable HTTP MCP server for rental listings in TP.HCM. Reads `RentalInfoTableV2` on DynamoDB (populated by `timtro-crawler`) and exposes `get_areas` + `search_rentals` tools.

Deploy target: **AWS Lambda** behind **API Gateway HTTP API** at `/mcp`. DynamoDB access uses the Lambda execution role — no long-lived AWS keys in environment variables beyond the MCP API key.

Production supports **permanent dual auth**:

- **OAuth 2.1 (Auth0)** for Cursor and other MCP clients that discover auth via RFC 9728 Protected Resource Metadata.
- **Static `MCP_API_KEY` Bearer token** for scripts, CI/smoke, and manual `headers` config.

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
| `AUTH0_DOMAIN` | Auth0 tenant domain, e.g. `your-tenant.auth0.com`. Enables OAuth when set with `MCP_SERVER_URL`. |
| `AUTH0_AUDIENCE` | Auth0 API identifier; must match the canonical MCP resource URI (usually same as `MCP_SERVER_URL`). |
| `MCP_SERVER_URL` | Canonical MCP resource URI, e.g. `https://{api-id}.execute-api.ap-southeast-1.amazonaws.com/mcp`. |
| `RENTAL_INFO_TABLE_NAME` | DynamoDB v2 table, e.g. `timtro-rental-info-v2-dev` |
| `AWS_REGION` | Default `ap-southeast-1` |
| `AWS_PROFILE` / access keys | Local AWS credentials for `search_rentals` |

Smoke test (server must be running on port 3000):

```bash
pnpm smoke
# CI-friendly (skip DynamoDB):
SKIP_SEARCH_RENTALS=1 pnpm smoke
# JWT smoke against OAuth-enabled server:
MCP_ACCESS_TOKEN='eyJ...' pnpm smoke
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

## Auth0 setup (OAuth)

Complete this once per Auth0 tenant before enabling OAuth in production.

### Tenant toggles

1. Enable **Resource Parameter Compatibility Profile** (Auth0 Dashboard → tenant settings or MCP guide).
2. Enable **Dynamic Client Registration (DCR)**.
3. Enable **scope descriptions for consent** (recommended for MCP tool scopes).

### Auth0 API (resource server)

1. Create an Auth0 **API** with identifier = canonical MCP URL (HTTPS), e.g. stack output `McpApiUrl`:
   - `https://{api-id}.execute-api.ap-southeast-1.amazonaws.com/mcp`
2. Add scopes:
   - `tool:get_areas`
   - `tool:search_rentals`
3. Set **Default Permissions for Third-Party Apps** on this API (required for DCR clients like Cursor).
4. Promote the login connection(s) you want to **domain level** (required for third-party DCR apps).

### Optional static Cursor client

Pre-register a Native/SPA application with callback:

`cursor://anysphere.cursor-mcp/oauth/callback`

Use its `client_id` as a static OAuth fallback in Cursor `mcp.json` when DCR is unavailable.

### Verification checklist

- [ ] API identifier exactly matches deployed `McpApiUrl` / `MCP_SERVER_URL`
- [ ] Resource Parameter Compatibility Profile enabled
- [ ] DCR enabled; default third-party permissions grant MCP API scopes
- [ ] Test token from Auth0 Dashboard or SPA app includes correct `aud` claim
- [ ] `GET /.well-known/oauth-protected-resource/mcp` returns metadata pointing at Auth0

### Token debugging

| Symptom | Likely cause |
|---------|----------------|
| OAuth login succeeds but `/mcp` returns 401 | `aud` mismatch — API identifier must equal `MCP_SERVER_URL` / RFC 8707 `resource` |
| Cursor connects but tools fail silently | DCR client missing default API permissions |
| Cursor shows "Needs authentication" | Clear MCP tokens in Cursor; retry browser login |

## Cursor / MCP client

### OAuth (recommended for Cursor)

Add the MCP URL only — Cursor discovers Auth0 via 401 + Protected Resource Metadata:

```json
{
  "mcpServers": {
    "timtro": {
      "url": "https://{api-id}.execute-api.ap-southeast-1.amazonaws.com/mcp"
    }
  }
}
```

Static OAuth fallback (optional):

```json
{
  "mcpServers": {
    "timtro": {
      "url": "https://{api-id}.execute-api.ap-southeast-1.amazonaws.com/mcp",
      "auth": {
        "CLIENT_ID": "<auth0-native-app-client-id>"
      }
    }
  }
}
```

### API key (scripts / CI / manual config)

Permanent ops access alongside OAuth:

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

Local (dev bypass when `MCP_API_KEY` unset):

```json
{
  "mcpServers": {
    "timtro": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `get_areas` | Static catalog of supported cities/districts (no AWS). |
| `search_rentals` | Query DynamoDB v2 by city + district, optional filters. |

Always call `get_areas` first for valid `city` / `district` codes.

## Deploy sequence

1. **Crawler stack** — ensure `RentalInfoTableV2` exists (`pnpm crawler:deploy`).
2. **Auth0** — complete the checklist above; note the API identifier URL.
3. **MCP stack env** — copy `env.example.json` → `env.dev.json`, set parameters:

   | Parameter | Value |
   |-----------|-------|
   | `McpApiKey` | Shared secret for scripts/CI (permanent dual-auth) |
   | `Auth0Domain` | e.g. `your-tenant.auth0.com` |
   | `McpServerUrl` | Canonical MCP URL (= Auth0 API identifier) |
   | `Auth0Audience` | Same as `McpServerUrl` |

   Deploy:

   ```bash
   pnpm mcp:deploy
   # or: pnpm nx deploy timtro-mcp
   ```

4. **Stack output** — use `McpApiUrl` from CloudFormation outputs as the MCP client URL. If the execute-api URL changes, update the Auth0 API identifier to match.
5. **Cursor** — connect via OAuth URL-only config, or API key headers for manual setups.

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
- Bearer auth validated in the handler (not at API Gateway) so MCP can return RFC 9728 discovery challenges on 401.
- **Dual-auth ops model:** Cursor → OAuth; smoke/CI/scripts → API key. Both may run against production simultaneously.
- Do not log `Authorization` headers or Bearer tokens.
- Rotating `MCP_API_KEY` requires a stack redeploy with an updated `McpApiKey` parameter.
- Auth0 signing keys rotate automatically via JWKS — no Lambda redeploy needed for key rotation.
- Shared API key leakage grants full tool access — restrict distribution to ops/CI and rotate on exposure.
