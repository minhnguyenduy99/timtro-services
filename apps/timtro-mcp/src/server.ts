import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { loadCache, resolveCachePath } from './cache-loader.js';
import registerSearchRentalsTool from './tools/search_rentals.tool.js';

const instructions =
    'Timtro MCP: dữ liệu phòng trọ TP.HCM đọc từ file cache JSON cục bộ (được scraper cập nhật định kỳ). ' +
    'Luôn gọi `rentals_cache_stats` khi cần đường dẫn hoặc kiểm tra cache; dùng `search_rentals` với `area_query` (quận/đường/làng ĐHQG) và tùy chọn `max_price_vnd`. ' +
    'Giá trong bài đăng có thể là tiền thuê hoặc nhầm với cọc/điện nước — hãy đối chiếu `rent.matched_snippet` và `confidence`.';

const server = new McpServer(
    { name: 'timtro-mcp', version: '1.0.0' },
    {
        instructions
    }
);

server.registerTool(
    'rentals_cache_stats',
    {
        title: 'Thống kê cache phòng trọ',
        description: 'Đếm số bản ghi trong cache và trả về đường dẫn file đang dùng.',
        inputSchema: z.object({
            cache_path: z.string().optional().describe('Đường dẫn tùy chọn tới cache JSON.')
        }),
        outputSchema: z.object({
            cache_path: z.string(),
            record_count: z.number(),
            updated_at: z.string().optional()
        })
    },
    async ({ cache_path }) => {
        const resolvedPath = resolveCachePath(cache_path);
        const { items, updatedAt } = await loadCache(resolvedPath);
        const output = {
            cache_path: resolvedPath,
            record_count: items.length,
            updated_at: updatedAt
        };
        return {
            content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
            structuredContent: output
        };
    }
);

registerSearchRentalsTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
