import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { CacheFileShape, RentalRecord } from './types.js';

export type LoadedCache = {
    items: RentalRecord[];
    path: string;
    updatedAt?: string;
};

function normalizePayload(raw: CacheFileShape): { items: RentalRecord[]; updatedAt?: string } {
    if (Array.isArray(raw)) {
        return { items: raw };
    }
    return { items: raw.items ?? [], updatedAt: raw.updated_at };
}

export async function loadCache(cachePath: string): Promise<LoadedCache> {
    const resolved = path.resolve(cachePath);
    const buf = await readFile(resolved, 'utf8');
    const parsed = JSON.parse(buf) as CacheFileShape;
    const { items, updatedAt } = normalizePayload(parsed);
    return { items, path: resolved, updatedAt };
}

export function resolveCachePath(explicit?: string): string {
    if (explicit && explicit.trim()) {
        return path.resolve(explicit.trim());
    }
    const envPath = process.env.TIMTRO_CACHE_PATH;
    if (envPath && envPath.trim()) {
        return path.resolve(envPath.trim());
    }
    return path.resolve(process.cwd(), 'cache_rentals.json');
}
