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

/**
 * Who pays whom: everyone pays back the person who paid for each expense, and the only netting is
 * between the same two people (if A owes B and B owes A, just the difference is paid).
 * Repayments count as money the payer gave the recipient, so they reduce what the payer owes.
 */
export function settleUp(expenses: Expense[], currency: Currency): Settlement[] {
  const owed = new Map<string, number>(); // "debtor|creditor" -> amount
  const add = (from: string, to: string, amt: number) => owed.set(`${from}|${to}`, (owed.get(`${from}|${to}`) ?? 0) + amt);
  for (const e of expenses) {
    if (e.currency !== currency) continue;
    for (const s of e.shares) if (s.traveller_id !== e.paid_by) add(s.traveller_id, e.paid_by, s.amount);
  }
  const eps = 0.5 / unit(currency);
  const out: Settlement[] = [];
  const seen = new Set<string>();
  for (const key of owed.keys()) {
    const [a, b] = key.split('|');
    const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    const net = round((owed.get(`${a}|${b}`) ?? 0) - (owed.get(`${b}|${a}`) ?? 0), currency);
    if (net > eps) out.push({ from: a, to: b, amount: net, currency });
    else if (net < -eps) out.push({ from: b, to: a, amount: -net, currency });
  }
  return out;
}
