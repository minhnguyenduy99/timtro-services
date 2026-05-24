---
title: "feat: Align timtro-mcp with RentalInfo and DynamoDB"
type: feat
status: active
date: 2026-05-24
origin: docs/spec/data-models.md
---

# feat: Align timtro-mcp with RentalInfo and DynamoDB

## Summary

Extract shared rental domain logic into `libs/rental-info`, refactor the crawler to consume it, and rewrite `apps/timtro-mcp` to query `RentalInfoTable` directly via DynamoDB — removing the JSON cache path, the `rentals_cache_stats` tool, and legacy free-text search types.

---

## Problem Frame

The crawler now persists AI-sanitized `RentalInfo` records to DynamoDB (`timtro-rental-info-{env}`), but `timtro-mcp` still reads a local JSON cache with loose `RentalRecord` rows, regex price extraction, and duplicated district alias tables. The MCP tool surface, types, and search logic are out of sync with the canonical model in `docs/spec/data-models.md` and `apps/timtro-crawler/src/domain/`.

---

## Requirements

- R1. Extract shared rental domain types and logic into `libs/rental-info` so crawler and MCP share one source of truth.
- R2. Wire the library into the Nx/pnpm monorepo with correct TypeScript path resolution and build/test targets.
- R3. Refactor `apps/timtro-crawler` to import domain logic from `@timtro/rental-info` without behavior change.
- R4. Replace MCP JSON cache loading with DynamoDB `Query` on `RentalInfoTable` keyed by `region`.
- R5. Rewrite MCP search to use structured `RentalInfo` fields (`price`, `district`, `title`, `description`, etc.) instead of free-text parsing.
- R6. Remove the `rentals_cache_stats` tool and all cache-related code paths from MCP.
- R7. Enrich `search_rentals` output with sanitized listing fields agents need (title, address, district labels, attachments, post date, original link).
- R8. Resolve `area_query` using shared region mapping; support multi-district queries via region fan-out.
- R9. Preserve existing search parameters (`area_query`, `max_price_vnd`, `limit`, `strict_price_filter`) with semantics adapted to structured data.
- R10. Update smoke script, server instructions, and tests to reflect the DynamoDB-only path.

---

## Scope Boundaries

- Crawler sanitization pipeline, raw post table, SQS, and Lambda handlers — unchanged except import paths.
- New DynamoDB GSIs (price-sorted, `sourcePostId` lookup).
- Production AWS IAM policy authoring or MCP deployment infrastructure.
- Raw post reads, admin tooling, or cache export jobs.
- Backward compatibility with legacy `cache_rentals.json` or `RentalRecord` format.

### Deferred to Follow-Up Work

- MCP production deployment with IAM role / Cursor MCP config documentation: separate ops task once local DynamoDB path is proven.
- Sub-area alias expansion beyond district-level resolution (e.g. dedicated `lang_dai_hoc` → `thu_duc` mapping with post-query text filter): can be added to `libs/rental-info` in a follow-up if search quality regresses.
- DynamoDB GSI for cross-region price-sorted search: only needed at scale.

---

## Context & Research

### Relevant Code and Patterns

- Canonical spec: `docs/spec/data-models.md`
- Crawler domain (to move): `apps/timtro-crawler/src/domain/rental-info.ts`, `region-mapping.ts`, `rent-price.ts`, `schemas.ts`
- Crawler DynamoDB write: `apps/timtro-crawler/src/services/aws-clients.ts` (`DynamoRentalInfoStore.put` only today)
- MCP current search: `apps/timtro-mcp/src/services/rental-search.service.ts`, `apps/timtro-mcp/src/tools/search_rentals.tool.ts`
- MCP cache path (to remove): `apps/timtro-mcp/src/cache-loader.ts`, `apps/timtro-mcp/src/server.ts` (`rentals_cache_stats`)
- Nx app pattern: `apps/timtro-mcp/project.json`, `apps/timtro-crawler/project.json` with `nx:run-commands` + Vite SSR bundles
- Prior crawler plan deferred MCP→DynamoDB: `docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md`

### Institutional Learnings

- No `docs/solutions/` entries yet. `docs/spec/data-models.md` is the contract source of truth.

### External References

- AWS DynamoDB Query API via `@aws-sdk/lib-dynamodb` (already used in crawler)
- Nx library conventions: `projectType: "library"`, path aliases in `tsconfig.base.json`

---

## Key Technical Decisions

- **`libs/rental-info` as shared Nx library**: User-confirmed. Package name `@timtro/rental-info`. Holds types, Zod schemas, region mapping, price constants/helpers, and area-query resolution — not AWS or MCP-specific code.
- **No backward compatibility**: Remove JSON cache, `rentals_cache_stats`, `TIMTRO_CACHE_PATH`, `RentalRecord`, MCP-local `rent-extract.ts` and `constants.ts`.
- **DynamoDB-only data path in MCP**: `search_rentals` queries `RentalInfoTable` by resolved `region` PK(s). No local file fallback.
- **Area resolution = district-level PK lookup**: `area_query` tokens resolve to canonical district keys via shared `region-mapping`. Unmatched street/neighborhood tokens are ignored (no silent text scan). If zero districts resolve, return empty results with `resolved_regions: []`.
- **Multi-district fan-out**: Split `area_query` on `,;/|` and ` và `; query each resolved region in parallel; merge results sorted by `postDate` desc; apply global `limit`.
- **Price filtering on structured field**: Use `price` directly. `price === -1` (`UNKNOWN_RENTAL_PRICE`) is unknown. When `max_price_vnd` is set and `strict_price_filter` is true, exclude unknown-price rows. When `max_price_vnd` is set without strict mode, include unknown-price rows.
- **Output shape**: Replace regex-based `rent { amount_vnd, confidence, matched_snippet }` with `price_vnd: number | null` and `price_unknown: boolean`. Expose `title`, `description`, `address`, `city_label`, `district_label`, `original_link`, `post_date`, `attachments`.
- **AWS errors propagate as tool errors**: DynamoDB auth, throttling, or missing table config fail the tool call — not `{ count: 0 }`.
- **Vite bundles lib inline**: Both apps use `ssr.noExternal: true`; add `@timtro/rental-info` to externals list exclusion so domain code is bundled into app outputs (no separate lib build artifact required for runtime).

---

## Open Questions

### Resolved During Planning

- **Shared types location?** → `libs/rental-info` with Nx library project and `@timtro/rental-info` package name.
- **Keep JSON cache for local dev?** → No. DynamoDB only; local dev uses real or LocalStack table via env vars.
- **Keep `rentals_cache_stats`?** → No. Remove entirely.

### Deferred to Implementation

- **Exact fetch budget per region before merge-sort**: Start with `limit` items per region query (with pagination if needed); tune if hot districts dominate results.
- **Whether to add `lang_dai_hoc` aliases to region-mapping now or in follow-up**: Implementer should backport MCP-only aliases from `constants.ts` that map to known districts (e.g. `làng đại học` → `thu_duc`) during lib extraction; defer post-query text filtering unless tests show regression.

---

## Output Structure

    libs/rental-info/
    ├── project.json
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
        ├── index.ts
        ├── rental-info.ts
        ├── region-mapping.ts
        ├── rent-price.ts
        ├── schemas.ts
        └── area-query.ts          # resolve area_query → region PKs
    test/
        ├── rental-info-schema.test.ts
        ├── region-mapping.test.ts
        ├── rent-price.test.ts
        └── area-query.test.ts

    apps/timtro-mcp/src/
        ├── services/
        │   ├── rental-info.repository.ts   # DynamoDB Query
        │   └── rental-search.service.ts    # rewritten
        └── tools/
            └── search_rentals.tool.ts        # updated I/O

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```mermaid
flowchart LR
  Tool[search_rentals tool] --> Search[RentalSearchService]
  Search --> Area[area-query.ts in lib]
  Area --> Regions[region PK list]
  Search --> Repo[RentalInfoRepository]
  Repo --> DDB[(RentalInfoTable)]
  Search --> Filter[price filter + sort + limit]
  Filter --> Output[structured MCP response]

  Crawler[Crawler SanitizeFunction] --> Lib[@timtro/rental-info]
  MCP[MCP server] --> Lib
```

**Search flow (directional):**

1. Parse `area_query` → list of `region` strings (`ho_chi_minh_{district}`)
2. For each region: `Query` DynamoDB (`PK = region`), paginate until enough items or exhausted
3. Validate rows with `rentalInfoSchema` from lib
4. Filter: `max_price_vnd`, `strict_price_filter` on structured `price`
5. Merge all regions, sort by `postDate` descending, take `limit`
6. Map to MCP output shape

---

## Implementation Units

- U1. **Scaffold `libs/rental-info` Nx library**

**Goal:** Create the shared library project with monorepo wiring so both apps can import `@timtro/rental-info`.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `libs/rental-info/project.json`
- Create: `libs/rental-info/package.json`
- Create: `libs/rental-info/tsconfig.json`
- Create: `libs/rental-info/vitest.config.ts`
- Create: `libs/rental-info/src/index.ts`
- Modify: `pnpm-workspace.yaml` (add `libs/*`)
- Modify: `tsconfig.base.json` (add path alias)
- Modify: `apps/timtro-mcp/package.json` (add `workspace:*` dep)
- Modify: `apps/timtro-crawler/package.json` (add `workspace:*` dep)

**Approach:**

Set up `libs/rental-info` as an Nx library following existing app conventions:

| File | Purpose |
|------|---------|
| `libs/rental-info/project.json` | `"projectType": "library"`, `"sourceRoot": "libs/rental-info/src"`, targets: `test` (vitest), `typecheck` (tsc --noEmit) |
| `libs/rental-info/package.json` | `"name": "@timtro/rental-info"`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }` |
| `libs/rental-info/tsconfig.json` | Extends `../../tsconfig.base.json`; `"composite": true`, `"rootDir": "src"`, `"include": ["src/**/*", "test/**/*"]` |
| `pnpm-workspace.yaml` | Add `- libs/*` alongside `apps/*` |
| `tsconfig.base.json` | Add `"paths": { "@timtro/rental-info": ["libs/rental-info/src/index.ts"] }` |

Apps consume via:
- `"@timtro/rental-info": "workspace:*"` in app `package.json`
- TypeScript resolves through `tsconfig.base.json` paths (apps already extend base)
- Vite bundles lib source inline (`noExternal: true` — do not list `@timtro/rental-info` in externals)

Add Nx `dependsOn: ["^test"]` or explicit lib test dependency in app test targets if desired; minimum: lib has its own `nx test rental-info` target.

**Patterns to follow:**
- `apps/timtro-mcp/project.json` target structure
- Root `tsconfig.base.json` ESM/NodeNext settings

**Test scenarios:**
- Test expectation: none — scaffolding only; verified by U2 tests passing and app typechecks resolving `@timtro/rental-info`.

**Verification:**
- `pnpm install` resolves `@timtro/rental-info` workspace link
- `nx typecheck rental-info` passes (empty lib)
- Both apps can import from `@timtro/rental-info` without TS errors

---

- U2. **Move shared domain code into `libs/rental-info`**

**Goal:** Relocate rental domain types, validation, region mapping, and price logic from crawler into the shared library with tests.

**Requirements:** R1, R2

**Dependencies:** U1

**Files:**
- Create: `libs/rental-info/src/rental-info.ts` (from crawler)
- Create: `libs/rental-info/src/region-mapping.ts` (from crawler; backport useful MCP aliases like `làng đại học` → `thu_duc`)
- Create: `libs/rental-info/src/rent-price.ts` (from crawler)
- Create: `libs/rental-info/src/schemas.ts` (rental-related schemas only: `rentalAttachmentSchema`, `rentalInfoSchema`, `rentalInfoCandidateSchema`, validators)
- Create: `libs/rental-info/src/area-query.ts` (new: `resolveAreaQueryToRegions(areaQuery: string): { regions: string[]; districts: RegionEntry[] }`)
- Create: `libs/rental-info/src/index.ts` (re-export public API)
- Move: `apps/timtro-crawler/test/domain/rental-info-schema.test.ts` → `libs/rental-info/test/`
- Move: `apps/timtro-crawler/test/domain/region-mapping.test.ts` → `libs/rental-info/test/`
- Move: `apps/timtro-crawler/test/domain/rent-price.test.ts` → `libs/rental-info/test/`
- Create: `libs/rental-info/test/area-query.test.ts`
- Delete: moved source files from `apps/timtro-crawler/src/domain/` (rental-info, region-mapping, rent-price; partial schemas)

**Approach:**
- Move files verbatim first, fix internal imports to relative paths within lib
- Keep crawler-specific schemas (`sanitizationMessageSchema`, raw post validation) in crawler — only move rental-info-related exports
- `area-query.ts` splits query on `,;/|` and ` và `, resolves each token through district lookup, builds `region` via `buildRegion("ho_chi_minh", districtKey)`, deduplicates
- Export `UNKNOWN_RENTAL_PRICE`, `RentalInfo`, `RentalAttachment`, `buildRegion`, `resolveRegionFields`, `resolveDistrict`, `rentalInfoSchema`, `validateRentalInfoCandidate`, etc. from `index.ts`
- Add `zod` as dependency of `@timtro/rental-info`

**Patterns to follow:**
- Existing crawler domain file structure and test style

**Test scenarios:**
- Happy path: existing crawler domain tests pass unchanged after move
- Happy path: `resolveAreaQueryToRegions("Bình Thạnh")` → `["ho_chi_minh_binh_thanh"]`
- Happy path: `resolveAreaQueryToRegions("Bình Thạnh, Thủ Đức")` → two region keys
- Edge case: empty or whitespace `area_query` → empty regions list
- Edge case: unknown token with no district match → excluded from regions (not an error)
- Edge case: `làng đại học` token resolves to `thu_duc` if alias backported

**Verification:**
- `nx test rental-info` passes all moved + new tests
- No duplicate domain files remain in crawler `src/domain/` for moved modules

---

- U3. **Refactor crawler to consume `@timtro/rental-info`**

**Goal:** Update crawler imports and schemas so it uses the shared library without changing runtime behavior.

**Requirements:** R3

**Dependencies:** U2

**Files:**
- Modify: `apps/timtro-crawler/src/domain/schemas.ts` (import rental schemas from lib; keep crawler-only schemas local)
- Modify: `apps/timtro-crawler/src/domain/raw-rental-post.ts` (import `RentalAttachment` from `@timtro/rental-info`)
- Modify: all crawler files importing from `./domain/rental-info`, `./domain/region-mapping`, `./domain/rent-price`
- Modify: `apps/timtro-crawler/test/**` — update import paths for moved tests (or delete moved test files)
- Modify: `apps/timtro-crawler/vite.config.ts` if needed to resolve workspace package

**Approach:**
- Replace relative domain imports with `@timtro/rental-info`
- Keep `raw-rental-post.ts` and crawler-only schema/validation in crawler
- Run full crawler test suite to confirm no regressions

**Patterns to follow:**
- Existing crawler import style; use package import not relative cross-app paths

**Test scenarios:**
- Integration: `nx test timtro-crawler` — all existing tests pass
- Happy path: sanitization service tests still validate and persist `RentalInfo` correctly

**Verification:**
- Crawler builds: `nx build timtro-crawler` (or equivalent vite+sam build)
- Zero imports from deleted crawler domain files

---

- U4. **Add MCP DynamoDB rental info repository**

**Goal:** Implement read access to `RentalInfoTable` with region-scoped Query and row validation.

**Requirements:** R4

**Dependencies:** U2

**Files:**
- Create: `apps/timtro-mcp/src/services/rental-info.repository.ts`
- Create: `apps/timtro-mcp/test/rental-info.repository.test.ts`
- Modify: `apps/timtro-mcp/package.json` (add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)

**Approach:**
- `RentalInfoRepository` accepts `DynamoDBDocumentClient` + table name (from `RENTAL_INFO_TABLE_NAME` env)
- `queryByRegion(region: string, options?: { limit?: number })`: Query PK = region, handle `LastEvaluatedKey` pagination
- Validate each item with `rentalInfoSchema` from `@timtro/rental-info`; skip or log invalid rows (implementer choice — prefer skip with warning in dev)
- Factory: `createRentalInfoRepository()` using default AWS credential chain
- Do not reuse crawler's write-only `DynamoRentalInfoStore` — MCP gets its own read-focused class in MCP app (keeps lib free of AWS deps)

**Patterns to follow:**
- `apps/timtro-crawler/src/services/aws-clients.ts` for DocumentClient setup (`removeUndefinedValues: true`)

**Test scenarios:**
- Happy path: mock DocumentClient returns items → repository returns validated `RentalInfo[]`
- Happy path: pagination — two pages merged into single result set
- Edge case: empty Query result → `[]`
- Error path: DynamoDB throws → error propagates (not swallowed)
- Edge case: row fails Zod validation → skipped (does not fail entire query)

**Verification:**
- Repository unit tests pass with mocked AWS client
- Typecheck passes with AWS SDK deps

---

- U5. **Rewrite MCP search service for RentalInfo**

**Goal:** Replace free-text cache search with structured DynamoDB-backed search using shared area resolution and price filtering.

**Requirements:** R5, R8, R9

**Dependencies:** U2, U4

**Files:**
- Rewrite: `apps/timtro-mcp/src/services/rental-search.service.ts`
- Rewrite: `apps/timtro-mcp/src/search-rentals.ts`
- Rewrite: `apps/timtro-mcp/src/types.ts` (MCP-specific search types only; remove `RentalRecord`, `CacheFileShape`)
- Rewrite: `apps/timtro-mcp/test/rental-search.service.test.ts`

**Approach:**
- `RentalSearchService` depends on `RentalInfoRepository` (inject for testing)
- `search(params)`: resolve regions via `resolveAreaQueryToRegions` → fan-out queries → merge → filter by price → sort by `postDate` desc → limit
- Price filter: if `maxPriceVnd` set, exclude rows where `price > maxPriceVnd`; if also `strictPriceFilter`, exclude `price === UNKNOWN_RENTAL_PRICE`
- Return typed `SearchResult` with enriched fields (not legacy `SearchHit`)
- Remove all usage of `DISTRICT_ALIAS_GROUPS`, `estimateMonthlyRent`, `getFullText`

**Execution note:** Rewrite tests first against mocked repository + known `RentalInfo` fixtures before deleting old search logic.

**Patterns to follow:**
- Service class pattern from existing `RentalSearchService`
- Price constants from `@timtro/rental-info`

**Test scenarios:**
- Happy path: single region query returns matching listings filtered by max price
- Happy path: multi-region query merges and sorts by postDate desc
- Edge case: zero resolved regions → empty results, `resolved_regions: []`
- Edge case: `price === -1` included when max price set but strict false
- Edge case: `price === -1` excluded when strict true and max price set
- Edge case: global limit applied after merge (not per-region over-return)
- Error path: repository throws → error propagates to caller

**Verification:**
- All search service unit tests pass with mocked repository
- No imports from deleted MCP modules (`constants`, `rent-extract`, `cache-loader`)

---

- U6. **Update MCP tool surface and remove cache tooling**

**Goal:** Align the MCP public contract with DynamoDB-backed search; remove cache tool and dead code.

**Requirements:** R6, R7, R10

**Dependencies:** U5

**Files:**
- Rewrite: `apps/timtro-mcp/src/tools/search_rentals.tool.ts`
- Modify: `apps/timtro-mcp/src/server.ts`
- Delete: `apps/timtro-mcp/src/cache-loader.ts`
- Delete: `apps/timtro-mcp/src/constants.ts`
- Delete: `apps/timtro-mcp/src/rent-extract.ts`
- Delete: `apps/timtro-mcp/test/cache-loader.test.ts`
- Delete: `apps/timtro-mcp/test/rent-extract.test.ts`
- Modify: `scripts/smoke-call.mjs`
- Modify: `apps/timtro-mcp/project.json` (if env vars documented in serve target)

**Approach:**

**`search_rentals` input schema changes:**
- Remove: `cache_path`
- Keep: `area_query`, `max_price_vnd`, `limit`, `strict_price_filter`

**`search_rentals` output schema changes:**
- Remove: `cache_path`
- Add: `resolved_regions: string[]`
- Results array fields: `id`, `title`, `description`, `address`, `city_label`, `district_label`, `price_vnd`, `price_unknown`, `original_link`, `post_date`, `attachments`, `source`

**Server changes:**
- Remove `rentals_cache_stats` tool registration entirely
- Update MCP instructions: data comes from DynamoDB `RentalInfoTable`; requires `RENTAL_INFO_TABLE_NAME` (+ AWS credentials); no cache stats tool

**Smoke script:**
- Remove `rentals_cache_stats` call
- Call `search_rentals` only; document required env vars in script comment

**Environment variables (MCP):**
- `RENTAL_INFO_TABLE_NAME` (required)
- `AWS_REGION` (optional, default SDK behavior)
- Standard AWS credential chain (`AWS_PROFILE`, env keys, IAM role)

**Patterns to follow:**
- Existing Zod schema style in `search_rentals.tool.ts`

**Test scenarios:**
- Happy path: tool handler returns structured output matching new Zod output schema
- Edge case: missing `RENTAL_INFO_TABLE_NAME` → tool error with clear message
- Integration: smoke script runs against built server (may skip in CI without AWS; document accordingly)

**Verification:**
- `nx build timtro-mcp` succeeds
- `nx test timtro-mcp` passes
- Server registers exactly one tool (`search_rentals`)
- No references to `cache_rentals`, `TIMTRO_CACHE_PATH`, or `rentals_cache_stats` in MCP app

---

## System-Wide Impact

- **Interaction graph:** MCP `search_rentals` → `RentalSearchService` → `RentalInfoRepository` → DynamoDB. Crawler write path unchanged; both apps read/write same table schema via shared lib types.
- **Error propagation:** AWS errors bubble to MCP tool error response. Zod validation failures on individual rows are contained (skip row). Area resolution failure returns empty results, not an error.
- **State lifecycle risks:** None — MCP is read-only on DynamoDB.
- **API surface parity:** MCP tool contract changes breaking for agents expecting `cache_path` and `rentals_cache_stats`. Document in plan; no backward compat per user decision.
- **Integration coverage:** Unit tests with mocked DynamoDB prove search logic; optional manual smoke against dev table validates end-to-end.
- **Unchanged invariants:** Crawler crawl/sanitize/write pipeline, DynamoDB table keys (`region` + `id`), and `RentalInfo` field semantics per `docs/spec/data-models.md`.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Vite fails to bundle workspace lib | Verify `@timtro/rental-info` not in externals; test `nx build` both apps |
| Area search quality regresses for sub-area queries | Backport key MCP aliases into lib `region-mapping`; defer text filter to follow-up |
| Large region result sets exceed latency budget | Cap per-region fetch to `limit`; paginate only when needed |
| MCP local dev requires AWS credentials | Document env vars; optional LocalStack endpoint support deferred |
| Crawler refactor breaks sanitization | Run full crawler test suite after U3; no logic changes intended |

---

## Documentation / Operational Notes

- Update `docs/spec/data-models.md` § Search to note MCP reads `RentalInfoTable` directly (replace "Future search" wording).
- MCP env vars for local/Cursor config: `RENTAL_INFO_TABLE_NAME`, `AWS_REGION`, AWS credentials.
- Root `package.json` scripts: consider adding `"test:lib": "nx test rental-info"`.

---

## Sources & References

- **Origin document:** [docs/spec/data-models.md](docs/spec/data-models.md)
- Prior plan: [docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md](docs/plans/2026-05-19-001-feat-timtro-crawler-service-plan.md)
- Crawler domain: `apps/timtro-crawler/src/domain/`
- MCP current: `apps/timtro-mcp/src/`
