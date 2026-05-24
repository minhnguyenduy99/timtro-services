import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { parseSearchSort } from '../services/rental-search.service';
import { searchRentals } from '../search-rentals';

const sortSchema = z
  .string()
  .regex(/^(date|price)\|(asc|desc)$/, 'sort phải có dạng "<field>|<order>" với field=date|price và order=asc|desc')
  .optional()
  .describe('Sắp xếp kết quả, ví dụ "date|desc" (mặc định), "price|asc".');

const searchInputSchema = z.object({
  city: z.string().describe('Mã thành phố, ví dụ "ho_chi_minh". Gọi get_areas để xem danh sách.'),
  district: z
    .string()
    .describe('Quận/huyện, phân tách bằng dấu phẩy, ví dụ "binh_thanh" hoặc "binh_thanh,thu_duc".'),
  date_range: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Chỉ lấy tin đăng trong N ngày gần nhất (tính từ thời điểm hiện tại).'),
  sort: sortSchema,
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
        'Truy vấn RentalInfoTableV2 trên DynamoDB theo thành phố + quận/huyện, giá tối đa (VND/tháng), ' +
        'khoảng ngày đăng (date_range) và sắp xếp (sort). Gọi get_areas trước để lấy city/district hợp lệ. ' +
        'Bảng v2 dùng LSI byPostDate/byPrice; date_range khi sort=price được lọc sau truy vấn. ' +
        'Yêu cầu biến môi trường RENTAL_INFO_TABLE_NAME và AWS credentials.',
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema
    },
    async ({ city, district, date_range, sort, max_price_vnd, limit, strict_price_filter }) => {
      const result = await searchRentals({
        city,
        district,
        dateRangeDays: date_range,
        sort: parseSearchSort(sort ?? 'date|desc'),
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
