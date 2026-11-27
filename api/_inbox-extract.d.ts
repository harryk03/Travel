export function isMapsLink(url: string): boolean;
export function findPhone(text: unknown): string | null;
export function findAddress(text: unknown): string | null;
export function extractDetails(text: unknown, caption: unknown, url: string | null): { name: string | null; address: string | null; phone: string | null; maps_url: string | null };
