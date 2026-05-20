export type RentalAttachment = {
  type: "photo" | "video";
  url: string;
};

export type RentalInfo = {
  region: string;
  id: string;
  source: "fb";
  sourcePostId: string;
  sourceCommentId?: string;
  address: string;
  city: string;
  district: string;
  title: string;
  postDate: string;
  timestamp: string;
  originalLink: string;
  attachments: RentalAttachment[];
};

export type RentalInfoCandidate = Omit<RentalInfo, "region" | "id" | "source"> & {
  source?: "fb";
};

export function buildRegion(city: string, district: string): string {
  return `${normalizeRegionPart(city)}_${normalizeRegionPart(district)}`;
}

export function buildRentalInfoId(postId: string, commentId?: string): string {
  return `fb_${commentId ?? postId}`;
}

export function normalizeRegionPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toRentalInfo(candidate: RentalInfoCandidate): RentalInfo {
  return {
    ...candidate,
    source: "fb",
    region: buildRegion(candidate.city, candidate.district),
    id: buildRentalInfoId(candidate.sourcePostId, candidate.sourceCommentId),
    attachments: candidate.attachments
  };
}
