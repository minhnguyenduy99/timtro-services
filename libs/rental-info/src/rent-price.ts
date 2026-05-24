export type ParsedMonthlyRent = {
  price: number;
};

export const UNKNOWN_RENTAL_PRICE = -1;

const RENT_CTX =
  /giá\s*(?:thuê|phòng|nhà)?|tiền\s*(?:nhà|thuê|phòng)|thuê\s*(?:phòng|nhà)?|phòng\s*trọ|cho\s*thuê|ở\s*ghép|ở\s*trọ|(?:^|\s)\*\s*giá|\/tháng|\/tháng\.|một\s*tháng|per\s*month/i;
const DEPOSIT_CTX = /cọc|đặt\s*cọc|đặt\s*trước|tiền\s*cọc|deposit/i;
const UTIL_BILL_CTX = /(?:điện|nước)\s*\d|kwh|kw\s*h|số\s*điện|tiền\s*điện|tiền\s*nước/i;
const INCLUDE_UTILS = /bao\s*(?:điện|điện\s*nước|full\s*dịch\s*vụ|full\s*tien\s*nghi)|full\s*nội\s*thất/i;
const CONTACT_CTX = /liên hệ|contact|zalo|mess|hotline|sdt|đt|tel|📞|☎️|call/i;
const PHONE_PATTERN = /(?:\+84|0)(?:[\s.\-]*\d){8,11}/g;

type Candidate = { amountVnd: number; start: number; end: number; raw: string };

export function isValidRentalPrice(price: number): boolean {
  return (
    Number.isInteger(price) &&
    price > 0 &&
    price % 1000 === 0 &&
    price >= 400_000 &&
    price <= 80_000_000
  );
}

export function resolveRentalPrice(input: { aiPrice?: unknown; text: string }): { price: number; priceUnit: "VND" } {
  if (input.aiPrice === UNKNOWN_RENTAL_PRICE) {
    return { price: UNKNOWN_RENTAL_PRICE, priceUnit: "VND" };
  }

  const fromAi = coercePrice(input.aiPrice, input.text);
  if (fromAi !== undefined) {
    return { price: fromAi, priceUnit: "VND" };
  }

  const fromText = parseMonthlyRentVnd(input.text)?.price;
  if (fromText !== undefined) {
    return { price: fromText, priceUnit: "VND" };
  }

  return { price: UNKNOWN_RENTAL_PRICE, priceUnit: "VND" };
}

export function parseMonthlyRentVnd(text: string): ParsedMonthlyRent | undefined {
  if (!text.trim()) {
    return undefined;
  }

  const phoneSpans = collectPhoneSpans(text);
  const candidates: Candidate[] = [];
  collectTriEuCu(text, candidates, phoneSpans);
  collectDottedMillions(text, candidates, phoneSpans);
  collectTrailingK(text, candidates, phoneSpans);

  if (candidates.length === 0) {
    return undefined;
  }

  let best: { candidate: Candidate; score: number } | undefined;
  for (const candidate of candidates) {
    const score = scoreAt(text, candidate.start, candidate.end);
    if (score < 1) {
      continue;
    }
    if (!best || score > best.score || (score === best.score && candidate.start < best.candidate.start)) {
      best = { candidate, score };
    }
  }

  if (!best) {
    return undefined;
  }

  return {
    price: best.candidate.amountVnd
  };
}

export function coercePrice(value: unknown, contextText = ""): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === UNKNOWN_RENTAL_PRICE) {
      return UNKNOWN_RENTAL_PRICE;
    }
    return normalizePrice(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    if (trimmed === "-1") {
      return UNKNOWN_RENTAL_PRICE;
    }

    const digitsOnly = trimmed.replace(/[^\d]/g, "");
    if (digitsOnly.length >= 6) {
      return normalizePrice(parseInt(digitsOnly, 10));
    }

    return parseMonthlyRentVnd(`${trimmed}\n${contextText}`)?.price;
  }

  return undefined;
}

function normalizePrice(amount: number): number | undefined {
  if (amount === UNKNOWN_RENTAL_PRICE) {
    return UNKNOWN_RENTAL_PRICE;
  }
  return clampRent(amount) ?? undefined;
}

function scoreAt(text: string, start: number, end: number): number {
  const window = text.slice(Math.max(0, start - 48), Math.min(text.length, end + 48));
  let score = 0;
  if (RENT_CTX.test(window)) {
    score += 6;
  }
  if (CONTACT_CTX.test(window)) {
    score -= 8;
  }
  if (DEPOSIT_CTX.test(window)) {
    score -= 3;
  }
  if (UTIL_BILL_CTX.test(window) && !INCLUDE_UTILS.test(window)) {
    score -= 2;
  }
  return score;
}

function clampRent(amount: number): number | null {
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (!isValidRentalPrice(amount)) {
    return null;
  }
  return amount;
}

function collectPhoneSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(PHONE_PATTERN)) {
    if (match.index !== undefined) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return spans;
}

function overlapsPhoneSpan(start: number, end: number, phoneSpans: Array<{ start: number; end: number }>): boolean {
  return phoneSpans.some((span) => start < span.end && end > span.start);
}

function parseMillionChunk(intPart: number, frac?: number): number {
  const base = intPart * 1_000_000;
  if (frac === undefined) {
    return base;
  }
  return base + frac * 1_000_000;
}

function collectTriEuCu(
  text: string,
  out: Candidate[],
  phoneSpans: Array<{ start: number; end: number }>
): void {
  const pattern = /(\d+(?:[.,]\d+)?)\s*(?:triệu|tr(?:iệu)?|củ)\b|(\d+)\s*tr\s*(\d{1,3})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    let amount: number | null = null;
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    if (overlapsPhoneSpan(start, end, phoneSpans)) {
      continue;
    }
    if (match[3] !== undefined) {
      const whole = parseInt(match[2]!, 10);
      const tail = match[3]!;
      let frac: number;
      if (tail.length === 1) {
        frac = parseInt(tail, 10) / 10;
      } else if (tail.length === 2) {
        frac = parseInt(tail, 10) / 100;
      } else {
        frac = parseInt(tail, 10) / 1000;
      }
      amount = clampRent(parseMillionChunk(whole, frac));
    } else if (match[1]) {
      const value = parseFloat(match[1].replace(",", "."));
      amount = clampRent(value * 1_000_000);
    }
    if (amount !== null) {
      out.push({ amountVnd: amount, start, end, raw });
    }
  }
}

function collectDottedMillions(
  text: string,
  out: Candidate[],
  phoneSpans: Array<{ start: number; end: number }>
): void {
  const pattern = /\b(\d{1,3}(?:\.\d{3}){1,3})\s*(?:đồng|đ|vnđ|vnd)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    if (overlapsPhoneSpan(start, end, phoneSpans)) {
      continue;
    }
    const digits = match[1]!.replace(/\./g, "");
    if (digits.startsWith("0") && digits.length <= 11) {
      continue;
    }
    const amount = clampRent(parseInt(digits, 10));
    if (amount !== null) {
      out.push({ amountVnd: amount, start, end, raw });
    }
  }
}

function collectTrailingK(
  text: string,
  out: Candidate[],
  phoneSpans: Array<{ start: number; end: number }>
): void {
  const pattern = /\b(\d{3,5})\s*k\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    const end = start + raw.length;
    if (overlapsPhoneSpan(start, end, phoneSpans)) {
      continue;
    }
    const amount = clampRent(parseInt(match[1]!, 10) * 1000);
    if (amount !== null) {
      out.push({ amountVnd: amount, start, end, raw });
    }
  }
}
