/**
 * Aliases for HCMC districts / student-heavy areas.
 * Matching is substring-based on normalized text + query tokens.
 */
export const DISTRICT_ALIAS_GROUPS: { canonical: string; aliases: string[] }[] = [
  { canonical: 'Quận 1', aliases: ['q1', 'quận 1', 'quan 1', 'district 1'] },
  { canonical: 'Quận 3', aliases: ['q3', 'quận 3', 'quan 3'] },
  { canonical: 'Quận 4', aliases: ['q4', 'quận 4', 'quan 4'] },
  { canonical: 'Quận 5', aliases: ['q5', 'quận 5', 'quan 5', 'chinatown', 'chợ lớn'] },
  { canonical: 'Quận 6', aliases: ['q6', 'quận 6', 'quan 6'] },
  { canonical: 'Quận 7', aliases: ['q7', 'quận 7', 'quan 7', 'phú mỹ hưng', 'phu my hung'] },
  { canonical: 'Quận 8', aliases: ['q8', 'quận 8', 'quan 8'] },
  { canonical: 'Quận 10', aliases: ['q10', 'quận 10', 'quan 10'] },
  { canonical: 'Quận 11', aliases: ['q11', 'quận 11', 'quan 11'] },
  { canonical: 'Quận 12', aliases: ['q12', 'quận 12', 'quan 12'] },
  { canonical: 'Bình Thạnh', aliases: ['binh thanh', 'bình thạnh', 'q.bình thạnh', 'q binh thanh', 'p.bình thạnh'] },
  { canonical: 'Tân Bình', aliases: ['tan binh', 'tân bình', 'sân bay', 'lang cha ca'] },
  {
    canonical: 'Phú Nhuận',
    aliases: ['phu nhuan', 'phú nhuận', 'pnh']
  },
  { canonical: 'Gò Vấp', aliases: ['go vap', 'gò vấp', 'govap'] },
  { canonical: 'Tân Phú', aliases: ['tan phu', 'tân phú'] },
  { canonical: 'Bình Tân', aliases: ['binh tan', 'bình tân'] },
  {
    canonical: 'Thủ Đức',
    aliases: [
      'thu duc',
      'thủ đức',
      'tp thủ đức',
      'tp thu duc',
      'linh trung',
      'linh xuân',
      'linh xuan',
      'đông hòa',
      'dong hoa',
      'đại học quốc gia',
      'dai hoc quoc gia',
      'đhqg',
      'làng đại học',
      'lang dai hoc',
      'khu làng đại học',
      'khu lang dai hoc'
    ]
  },
  { canonical: 'Hóc Môn', aliases: ['hoc mon', 'hóc môn'] },
  { canonical: 'Củ Chi', aliases: ['cu chi', 'củ chi'] },
  { canonical: 'Bình Chánh', aliases: ['binh chanh', 'bình chánh'] },
  { canonical: 'Nhà Bè', aliases: ['nha be', 'nhà bè'] },
  { canonical: 'Cần Giờ', aliases: ['can gio', 'cần giờ'] }
];
