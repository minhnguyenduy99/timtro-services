import { listSupportedAreas } from '@timtro/rental-info';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

const getAreasOutputSchema = z.object({
  cities: z.array(
    z.object({
      city: z.string(),
      city_label: z.string(),
      district_list: z.array(
        z.object({
          district: z.string(),
          district_label: z.string()
        })
      )
    })
  )
});

export default function registerGetAreasTool(server: McpServer): void {
  server.registerTool(
    'get_areas',
    {
      title: 'Danh sách thành phố và quận/huyện hỗ trợ',
      description:
        'Trả về catalog tĩnh các thành phố và quận/huyện có thể dùng với search_rentals. ' +
        'Không đọc DynamoDB.',
      inputSchema: z.object({}),
      outputSchema: getAreasOutputSchema
    },
    async () => {
      const output = {
        cities: listSupportedAreas().map((city) => ({
          city: city.city,
          city_label: city.cityLabel,
          district_list: city.districtList.map((district) => ({
            district: district.district,
            district_label: district.districtLabel
          }))
        }))
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}
