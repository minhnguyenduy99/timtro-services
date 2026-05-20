import type { RentEstimate } from './types.js';

const RENT_CTX =
    /giá\s*(?:thuê|phòng|nhà)?|tiền\s*(?:nhà|thuê|phòng)|thuê\s*(?:phòng|nhà)?|phòng\s*trọ|cho\s*thuê|ở\s*ghép|ở\s*trọ|(?:^|\s)\*\s*giá|\/tháng|\/tháng\.|một\s*tháng|per\s*month/i;
const DEPOSIT_CTX = /cọc|đặt\s*cọc|đặt\s*trước|tiền\s*cọc|deposit/i;
const UTIL_BILL_CTX = /(?:điện|nước)\s*\d|kwh|kw\s*h|số\s*điện|tiền\s*điện|tiền\s*nước/i;
const INCLUDE_UTILS = /bao\s*(?:điện|điện\s*nước|full\s*dịch\s*vụ|full\s*tien\s*nghi)|full\s*nội\s*thất/i;

type Candidate = { amountVnd: number; start: number; end: number; raw: string };

function scoreAt(text: string, idx: number): number {
    const winStart = Math.max(0, idx - 48);
    const winEnd = Math.min(text.length, idx + 48);
    const w = text.slice(winStart, winEnd);
    let s = 0;
    if (RENT_CTX.test(w)) s += 6;
    if (DEPOSIT_CTX.test(w)) s -= 3;
    if (UTIL_BILL_CTX.test(w) && !INCLUDE_UTILS.test(w)) s -= 2;
    return s;
}

function clampRent(amount: number): number | null {
    if (!Number.isFinite(amount)) return null;
    /** Ignore absurd/out-of-band amounts for typical SV phòng trọ */
    if (amount < 400_000 || amount > 80_000_000) return null;
    return Math.round(amount);
}

/** Parse `triệu` / `tr` / `củ` amounts into VND. */
function parseMillionChunk(intPart: number, frac?: number): number {
    const base = intPart * 1_000_000;
    if (frac === undefined) return base;
    // frac is fractional millions: 5 -> 0.5tr for single digit convention
    return base + frac * 1_000_000;
}

function collectTriEuCu(text: string, out: Candidate[]): void {
    // "3 triệu", "3tr", "3 củ", optional decimal "3,5 triệu"
    const re =
        /(\d+(?:[.,]\d+)?)\s*(?:triệu|tr(?:iệu)?|củ)\b|(\d+)\s*tr\s*(\d{1,3})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        let amount: number | null = null;
        const raw = m[0];
        if (m[3] !== undefined) {
            const a = parseInt(m[2]!, 10);
            const tail = m[3]!;
            let frac: number;
            if (tail.length === 1) frac = parseInt(tail, 10) / 10;
            else if (tail.length === 2) frac = parseInt(tail, 10) / 100;
            else frac = parseInt(tail, 10) / 1000;
            amount = clampRent(parseMillionChunk(a, frac));
        } else if (m[1]) {
            const n = parseFloat(m[1].replace(',', '.'));
            amount = clampRent(n * 1_000_000);
        }
        if (amount !== null) {
            out.push({ amountVnd: amount, start: m.index, end: m.index + raw.length, raw });
        }
    }
}

function collectDottedMillions(text: string, out: Candidate[]): void {
    const re = /\b(\d{1,3}(?:\.\d{3}){1,3})\s*(?:đồng|đ|vnđ|vnd)?\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const digits = m[1]!.replace(/\./g, '');
        const n = parseInt(digits, 10);
        const amount = clampRent(n);
        if (amount !== null) {
            out.push({ amountVnd: amount, start: m.index, end: m.index + m[0].length, raw: m[0] });
        }
    }
}

function collectTrailingK(text: string, out: Candidate[]): void {
    // "2500k" = 2.5tr - only when rent-like context will be scored later
    const re = /\b(\d{3,5})\s*k\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const amount = clampRent(parseInt(m[1]!, 10) * 1000);
        if (amount !== null) {
            out.push({ amountVnd: amount, start: m.index, end: m.index + m[0].length, raw: m[0] });
        }
    }
}

/**
 * Best-effort monthly rent from noisy FB/web posts.
 * Intentionally conservative: prefers amounts near "giá/thuê/phòng trọ", down-ranks "cọc" and utility bills.
 */
export function estimateMonthlyRent(text: string): RentEstimate | undefined {
    if (!text.trim()) return undefined;
    const candidates: Candidate[] = [];
    collectTriEuCu(text, candidates);
    collectDottedMillions(text, candidates);
    collectTrailingK(text, candidates);

    if (candidates.length === 0) return undefined;

    let best: { c: Candidate; score: number } | undefined;
    for (const c of candidates) {
        const s = scoreAt(text, c.start);
        if (!best || s > best.score || (s === best.score && c.start < best.c.start)) {
            best = { c, score: s };
        }
    }

    if (!best) return undefined;

    let confidence: RentEstimate['confidence'] = 'low';
    if (best.score >= 3) confidence = 'high';
    else if (best.score >= 1) confidence = 'medium';

    const snipStart = Math.max(0, best.c.start - 24);
    const snipEnd = Math.min(text.length, best.c.end + 24);

    return {
        amountVnd: best.c.amountVnd,
        confidence,
        matchedSnippet: text.slice(snipStart, snipEnd).replace(/\s+/g, ' ').trim()
    };
}
