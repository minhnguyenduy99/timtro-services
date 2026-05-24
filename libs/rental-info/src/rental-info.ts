import { normalizeRegionPart, resolveRegionFields } from "./region-mapping";
import { UNKNOWN_RENTAL_PRICE } from "./rent-price";

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
  cityLabel: string;
  district: string;
  districtLabel: string;
  title: string;
  description: string;
  price: number;
  priceUnit: "VND";
  postDate: string;
  timestamp: string;
  originalLink: string;
  attachments: RentalAttachment[];
};

export type RentalInfoCandidate = {
  source?: "fb";
  sourcePostId: string;
  sourceCommentId?: string;
  address: string;
  city: string;
  district: string;
  title: string;
  description?: string;
  price?: number;
  priceUnit?: "VND";
  postDate: string;
  timestamp: string;
  originalLink: string;
  attachments: RentalAttachment[];
};

export function buildRegion(city: string, district: string): string {
  return `${normalizeRegionPart(city)}_${normalizeRegionPart(district)}`;
}

export function buildRentalInfoId(postId: string, commentId?: string): string {
  return `fb_${commentId ?? postId}`;
}

export { normalizeRegionPart } from "./region-mapping";

export function toRentalInfo(candidate: RentalInfoCandidate): RentalInfo {
  const region = resolveRegionFields(candidate.city, candidate.district);

  return {
    sourcePostId: candidate.sourcePostId,
    sourceCommentId: candidate.sourceCommentId,
    address: candidate.address,
    city: region.city,
    cityLabel: region.cityLabel,
    district: region.district,
    districtLabel: region.districtLabel,
    title: candidate.title,
    description: candidate.description ?? "",
    price: candidate.price ?? UNKNOWN_RENTAL_PRICE,
    priceUnit: "VND",
    postDate: candidate.postDate,
    timestamp: candidate.timestamp,
    originalLink: candidate.originalLink,
    attachments: candidate.attachments,
    source: "fb",
    region: `${region.city}_${region.district}`,
    id: buildRentalInfoId(candidate.sourcePostId, candidate.sourceCommentId)
  };
}
