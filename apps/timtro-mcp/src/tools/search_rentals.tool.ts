import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { searchRentals } from '../search-rentals';

const searchInputSchema = z.object({
  area_query: z.string().describe('Vùng mục tiêu: ví dụ "Bình Thạnh", "Thủ Đức làng đại học", "Quận 10".'),
  max_price_vnd: z.number().optional().describe('Giá thuê tối đa mỗi tháng (VND), ví dụ 3000000.'),
  limit: z.number().min(1).max(50).optional().describe('Số tin tối đa trả về (mặc định 12).'),
  strict_price_filter: z.boolean().optional().describe('Nếu true và có max_price_vnd: bỏ các tin không có giá rõ ràng. Mặc định false.')
});

const searchOutputSchema = z.object({
  resolved_regions: z.array(z.string()),
  count: z.number(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      address: z.string(),
      city_label: z.string(),
      district_label: z.string(),
      price_vnd: z.number().describe('Giá thuê VND/tháng; -1 nếu chưa xác định.'),
      price_unknown: z.boolean(),
      original_link: z.string(),
      post_date: z.string(),
      attachments: z.array(
        z.object({
          type: z.enum(['photo', 'video']),
          url: z.string()
        })
      ),
      source: z.literal('fb')
    })
  )
});

export default function registerSearchRentalsTool(server: McpServer): void {
  server.registerTool(
    'search_rentals',
    {
      title: 'Tìm phòng trọ (DynamoDB TP.HCM)',
      description:
        'Truy vấn RentalInfoTable trên DynamoDB theo khu vực (quận/huyện tại TP.HCM) và giá tối đa (VND/tháng). ' +
        'Yêu cầu biến môi trường RENTAL_INFO_TABLE_NAME và AWS credentials.',
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema
    },
    async ({ area_query, max_price_vnd, limit, strict_price_filter }) => {
      const result = await searchRentals({
        areaQuery: area_query,
        maxPriceVnd: max_price_vnd,
        limit: limit ?? 12,
        strictPriceFilter: strict_price_filter ?? false
      });

      const output = {
        resolved_regions: result.resolvedRegions,
        count: result.count,
        results: result.results.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          address: item.address,
          city_label: item.cityLabel,
          district_label: item.districtLabel,
          price_vnd: item.priceVnd,
          price_unknown: item.priceUnknown,
          original_link: item.originalLink,
          post_date: item.postDate,
          attachments: item.attachments,
          source: item.source
        }))
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}
