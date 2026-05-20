# timtro-mcp

MCP server (stdio) đọc cache phòng trọ TP.HCM từ file JSON — phù hợp pipeline scraper Apify + `cache_rentals.json`.

## Chạy

```bash
corepack enable
pnpm install
pnpm build
pnpm start
```

Gọi thử nhanh (spawn server riêng, không cần terminal đang `pnpm start`): `pnpm smoke`.

Biến môi trường tùy chọn: `TIMTRO_CACHE_PATH` — đường dẫn tuyệt đối hoặc tương đối tới file cache (mặc định: `./cache_rentals.json` theo thư mục làm việc của process).

## Cursor / MCP client

Thêm server (ví dụ trong cấu hình MCP của Cursor), trỏ tới `dist/apps/timtro-mcp/server.js` sau khi `pnpm build`:

```json
{
  "mcpServers": {
    "timtro": {
      "command": "node",
      "args": ["/ABS/PATH/TO/timtro-mcp/dist/apps/timtro-mcp/server.js"],
      "env": {
        "TIMTRO_CACHE_PATH": "/ABS/PATH/TO/cache_rentals.json"
      }
    }
  }
}
```

## Tools

| Tool | Mô tả |
|------|--------|
| `search_rentals` | Lọc theo `area_query`, tùy chọn `max_price_vnd`, `limit`, `strict_price_filter`, `cache_path`. |
| `rentals_cache_stats` | Số bản ghi + đường dẫn cache đang dùng. |

Định dạng cache: mảng bản ghi hoặc `{ "updated_at"?: string, "items": [...] }`. Mỗi bản ghi nên có ít nhất một trường text (`text`, `body`, `content`, …).

Yêu cầu Node **≥ 20**. `@cfworker/json-schema` là peer của `@modelcontextprotocol/server` (bản alpha hiện **bắt buộc** cài để `pnpm start` chạy được — đã có trong app package).

## Monorepo

Workspace dùng Nx + pnpm. App MCP nằm ở `apps/timtro-mcp`; các lệnh root (`pnpm build`, `pnpm dev`, `pnpm smoke`) chạy qua Nx target của project `timtro-mcp`.

App crawler mới nằm ở `apps/timtro-crawler`. Service này dùng AWS SAM, Apify, SQS, DynamoDB và Gemini để ingest/sanitize dữ liệu phòng trọ; chạy kiểm thử riêng bằng `corepack pnpm exec nx test timtro-crawler`. Xem `apps/timtro-crawler/README.md` để biết cấu hình, local SAM events, replay và CI/CD.
