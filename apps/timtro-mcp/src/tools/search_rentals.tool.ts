import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { loadCache, resolveCachePath } from '../cache-loader.js';
import { searchRentals } from '../search-rentals.js';

const searchInputSchema = z.object({
  area_query: z.string().describe('Vùng mục tiêu: ví dụ "Bình Thạnh", "Thủ Đức làng đại học", "Quận 10".'),
  max_price_vnd: z.number().optional().describe('Giá thuê tối đa mỗi tháng (VND), ví dụ 3000000.'),
  limit: z.number().min(1).max(50).optional().describe('Số tin tối đa trả về (mặc định 12).'),
  cache_path: z.string().optional().describe('Đường dẫn tùy chọn tới file JSON cache; mặc định TIMTRO_CACHE_PATH hoặc ./cache_rentals.json.'),
  strict_price_filter: z.boolean().optional().describe('Nếu true và có max_price_vnd: bỏ các tin không trích được giá thuê rõ ràng. Mặc định false.')
});

const searchOutputSchema = z.object({
  cache_path: z.string(),
  count: z.number(),
  results: z.array(
    z.object({
      id: z.string().optional(),
      url: z.string().optional(),
      source: z.string().optional(),
      district_matches: z.array(z.string()),
      rent: z
        .object({
          amount_vnd: z.number(),
          confidence: z.enum(['high', 'medium', 'low']),
          matched_snippet: z.string()
        })
        .optional(),
      text_preview: z.string()
    })
  )
});

export default function registerSearchRentalsTool(server: McpServer): void {
  server.registerTool(
    'search_rentals',
    {
      title: 'Tìm phòng trọ (cache TP.HCM)',
      description:
        'Lọc `cache_rentals.json` theo khu vực (quận/huyện/đường/làng đại học tại TP.HCM) và giá tối đa (VND/tháng). ' +
        'Không gọi scraper; chỉ đọc cache cục bộ.',
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema
    },
    async ({ area_query, max_price_vnd, limit, cache_path, strict_price_filter }) => {
      const resolvedPath = resolveCachePath(cache_path);
      const { items } = await loadCache(resolvedPath);
      const hits = searchRentals(items, {
        areaQuery: area_query,
        maxPriceVnd: max_price_vnd,
        limit: limit ?? 12,
        strictPriceFilter: strict_price_filter ?? false
      });

      const output = {
        cache_path: resolvedPath,
        count: hits.length,
        results: hits.map((h) => ({
          id: h.id,
          url: h.url,
          source: h.source,
          district_matches: h.districtMatches,
          rent: h.rent
            ? {
                amount_vnd: h.rent.amountVnd,
                confidence: h.rent.confidence,
                matched_snippet: h.rent.matchedSnippet
              }
            : undefined,
          text_preview: h.textPreview
        }))
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}
