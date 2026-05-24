import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';

import registerSearchRentalsTool from './tools/search_rentals.tool';

const instructions =
    'Timtro MCP: dữ liệu phòng trọ TP.HCM đọc trực tiếp từ DynamoDB RentalInfoTable (crawler cập nhật định kỳ). ' +
    'Dùng `search_rentals` với `area_query` (quận/huyện) và tùy chọn `max_price_vnd`. ' +
    'Cần `RENTAL_INFO_TABLE_NAME` và AWS credentials. Giá `price_unknown: true` nghĩa là chưa xác định giá thuê.';

const server = new McpServer(
    { name: 'timtro-mcp', version: '1.0.0' },
    {
        instructions
    }
);

registerSearchRentalsTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
