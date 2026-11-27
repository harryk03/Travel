/** Shrinks a photo to a small JPEG (base64, no data: prefix) so screenshots fit the free database. */
const MAX_B64 = 680_000; // the database accepts up to 700,000 characters

async function decode(file: Blob): Promise<{ w: number; h: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(file);
    return { w: bmp.width, h: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
  }
  // Older browsers: read as a data: URL (allowed by the page's image policy) and decode through <img>.
  const src = await new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('Could not read that image'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('Could not read that image'));
    i.src = src;
  });
  return { w: img.naturalWidth, h: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
}

/** A small square-ish preview (about 160 px, ~8 KB) for lists and the map. */
export async function makeThumb(file: Blob): Promise<string> {
  const src = await decode(file);
  const scale = Math.min(1, 200 / Math.min(src.w, src.h));
  const w = Math.max(1, Math.round(src.w * scale));
  const h = Math.max(1, Math.round(src.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that image');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  src.draw(ctx, w, h);
  for (const q of [0.6, 0.45, 0.3]) {
    const data = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? '';
    if (data.length >= 50 && data.length <= 38000) return data;
  }
  throw new Error('Could not make a preview of that image');
}

export async function shrinkImage(file: Blob): Promise<{ mime: 'image/jpeg'; data: string }> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Only images can be added');
  const src = await decode(file);
  for (const [side, quality] of [[1400, 0.72], [1100, 0.62], [900, 0.55], [700, 0.5]] as const) {
    const scale = Math.min(1, side / Math.max(src.w, src.h));
    const w = Math.max(1, Math.round(src.w * scale));
    const h = Math.max(1, Math.round(src.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    src.draw(ctx, w, h);
    const data = canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
    if (data.length >= 100 && data.length <= MAX_B64) return { mime: 'image/jpeg', data };
  }
  throw new Error('That image is too large');
}

/** +6282135732415 → "+62 821 3573 2415". Other numbers are shown as entered. */
export function fmtPhone(p: string): string {
  const d = p.replace(/[^\d+]/g, '');
  const m = d.match(/^\+62(\d{3})(\d{3,4})(\d{3,5})$/);
  return m ? `+62 ${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Digits for wa.me links: +62 821… → 62821…; local 08… → 628…. Null if it can't be a phone number. */
export function waDigits(p: string): string | null {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** Same rule as the database check on phone columns. */
export function validPhone(p: string): boolean {
  return /^\+?[0-9 ()-]{6,24}$/.test(p.trim());
}
