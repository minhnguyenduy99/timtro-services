import { McpServer } from '@modelcontextprotocol/server';

import registerGetAreasTool from './tools/get_areas.tool';
import registerSearchRentalsTool from './tools/search_rentals.tool';

export const TIMTRO_MCP_INSTRUCTIONS =
  'Timtro MCP: dữ liệu phòng trọ đọc từ DynamoDB RentalInfoTableV2 (crawler cập nhật định kỳ). ' +
  'Luôn gọi `get_areas` trước để lấy city/district hợp lệ, rồi dùng `search_rentals` với `city`, `district` ' +
  '(phân tách dấu phẩy), tùy chọn `date_range` (số ngày), `sort` (date|desc mặc định, price|asc, …) và `max_price_vnd`. ' +
  'Cần `RENTAL_INFO_TABLE_NAME` trỏ bảng v2 và AWS credentials. Giá `price_unknown: true` nghĩa là chưa xác định giá thuê.';

export function createTimtroMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'timtro-mcp', version: '1.0.0' },
    {
      instructions: TIMTRO_MCP_INSTRUCTIONS
    }
  );

  registerGetAreasTool(server);
  registerSearchRentalsTool(server);

  return server;
}
