import type { Currency, Expense, Share, Traveller } from './types';

export const CURRENCIES: Currency[] = ['AUD', 'IDR'];

/** Smallest unit we split to: cents for AUD, whole rupiah for IDR. */
export function unit(c: Currency): number {
  return c === 'AUD' ? 100 : 1;
}

export function round(amount: number, c: Currency): number {
  return Math.round(amount * unit(c)) / unit(c);
}

export function formatMoney(amount: number, c: Currency): string {
  if (c === 'IDR') return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
  return 'A$' + amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Split evenly in whole units; leftover units go to the first people so shares always sum to the total. */
export function equalShares(amount: number, currency: Currency, travellerIds: string[]): Share[] {
  if (travellerIds.length === 0) return [];
  const u = unit(currency);
  const total = Math.round(amount * u);
  const base = Math.floor(total / travellerIds.length);
  let rest = total - base * travellerIds.length;
  return travellerIds.map((id) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { traveller_id: id, amount: (base + extra) / u };
  });
}

export function sharesTotal(shares: Share[], currency: Currency): number {
  return round(shares.reduce((s, x) => s + x.amount, 0), currency);
}

/** Net balance per traveller per currency: positive = is owed money, negative = owes. */
export function balances(expenses: Expense[], travellers: Traveller[]): Record<Currency, Record<string, number>> {
  const out: Record<Currency, Record<string, number>> = { AUD: {}, IDR: {} };
  for (const c of CURRENCIES) for (const t of travellers) out[c][t.id] = 0;
  for (const e of expenses) {
    const b = out[e.currency];
    b[e.paid_by] = (b[e.paid_by] ?? 0) + e.amount;
    for (const s of e.shares) b[s.traveller_id] = (b[s.traveller_id] ?? 0) - s.amount;
  }
  for (const c of CURRENCIES) for (const k of Object.keys(out[c])) out[c][k] = round(out[c][k], c);
  return out;
}

export interface Settlement {
  from: string;
  to: string;
  amount: number;
  currency: Currency;
}

/** Greedy settle-up: largest debtor pays largest creditor until everyone is square. */
export function settleUp(net: Record<string, number>, currency: Currency): Settlement[] {
  const eps = 0.5 / unit(currency);
  const debtors = Object.entries(net).filter(([, v]) => v < -eps).map(([id, v]) => ({ id, v: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > eps).map(([id, v]) => ({ id, v }));
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].v, creditors[j].v);
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: round(pay, currency), currency });
    debtors[i].v -= pay;
    creditors[j].v -= pay;
    if (debtors[i].v <= eps) i++;
    if (creditors[j].v <= eps) j++;
  }
  return out;
}
