export function extractUrl(text: unknown): string | null;
export function normalizeUrl(raw: string): string | null;
export function sourceOf(url: string): 'instagram' | 'tiktok' | 'other';
export function isUnsafeHost(hostname: string): boolean;
