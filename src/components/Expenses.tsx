import { useMemo, useState } from 'react';
import { fmtDay, todayISO } from '../lib/dates';
import { balances, CURRENCIES, equalShares, formatMoney, round, settleUp, sharesTotal, unit, type Settlement } from '../lib/money';
import type { Currency, Expense, Share } from '../lib/types';
import { Empty, Field, Segmented, Sheet, useTrip } from '../ui';

export function Expenses() {
  const { data, offline } = useTrip();
  const { expenses, travellers } = data;
  const [currency, setCurrency] = useState<Currency>(() => (expenses[0]?.currency ?? 'AUD'));
  const [form, setForm] = useState<Partial<Expense> | null>(null);
  const name = (id: string) => travellers.find((t) => t.id === id)?.name ?? 'Removed traveller';

  const net = useMemo(() => balances(expenses, travellers), [expenses, travellers]);
  const plan = useMemo(() => settleUp(net[currency], currency), [net, currency]);
  const total = expenses.filter((e) => e.kind === 'expense' && e.currency === currency).reduce((s, e) => s + e.amount, 0);

  const repay = (s: Settlement) => setForm({
    kind: 'repayment', amount: s.amount, currency: s.currency, paid_by: s.from, split_type: 'custom',
    shares: [{ traveller_id: s.to, amount: s.amount }], description: 'Repayment',
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Expenses</h1>
        {!offline && <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense', currency })}>+ Add expense</button>}
      </div>

      <Segmented value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c === 'AUD' ? '🇦🇺 AUD' : '🇮🇩 IDR' }))} />

      <section className="card balance-card">
        <div className="ov-label">Group spend in {currency}</div>
        <div className="balance-total">{formatMoney(total, currency)}</div>
        <ul className="balances">
          {travellers.map((t) => {
            const v = net[currency][t.id] ?? 0;
            return (
              <li key={t.id}>
                <span>{t.name}</span>
                <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted'}>
                  {Math.abs(v) < 1 / unit(currency) ? 'settled' : v > 0 ? `gets back ${formatMoney(v, currency)}` : `owes ${formatMoney(-v, currency)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="section-title">🤝 Settle up ({currency})</h3>
        {plan.length === 0 ? <p className="muted">Everyone’s square in {currency}.</p> : (
          <div className="stack">
            {plan.map((s, i) => (
              <div key={i} className="card settle-row">
                <span><strong>{name(s.from)}</strong> {name(s.from) === 'You' ? 'pay' : 'pays'} <strong>{name(s.to)}</strong></span>
                <span className="settle-amt">{formatMoney(s.amount, s.currency)}</span>
                {!offline && <button className="btn btn-sm" onClick={() => repay(s)}>Record</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title">🧾 All expenses</h3>
        {expenses.length === 0 ? <Empty emoji="🧾" title="No expenses yet" /> : (
          <div className="stack">
            {expenses.map((e) => (
              <div key={e.id} className={`card expense-row ${e.kind}`} role="button" tabIndex={0} onClick={offline ? undefined : () => setForm(e)}>
                <div className="exp-emoji">{e.kind === 'repayment' ? '💸' : '🧾'}</div>
                <div className="exp-main">
                  <div className="item-title">{e.kind === 'repayment' ? `${name(e.paid_by)} → ${name(e.shares[0]?.traveller_id ?? '')}` : e.description || 'Expense'}</div>
                  <div className="item-sub">
                    {e.kind === 'repayment' ? 'Repayment' : `Paid by ${name(e.paid_by)} · ${e.split_type === 'equal' ? `split ${e.shares.length} ways` : 'custom split'}`} · {fmtDay(e.spent_on)}
                  </div>
                </div>
                <div className="exp-amt">{formatMoney(e.amount, e.currency)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {form && <ExpenseForm initial={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function ExpenseForm({ initial, onClose }: { initial: Partial<Expense>; onClose: () => void }) {
  const { data, act, backend, me } = useTrip();
  const { travellers } = data;
  const isRepay = initial.kind === 'repayment';
  const mine = travellers.find((t) => t.user_id === me.id)?.id ?? travellers[0]?.id ?? '';
  const [desc, setDesc] = useState(initial.description ?? '');
  const [amount, setAmount] = useState(initial.amount != null ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial.currency ?? 'AUD');
  const [paidBy, setPaidBy] = useState(initial.paid_by ?? mine);
  const [date, setDate] = useState(initial.spent_on ?? todayISO());
  const [split, setSplit] = useState<'equal' | 'custom'>(initial.split_type ?? 'equal');
  const [included, setIncluded] = useState<string[]>(initial.shares?.map((s) => s.traveller_id) ?? travellers.map((t) => t.id));
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries((initial.shares ?? []).map((s) => [s.traveller_id, String(s.amount)])),
  );
  const [recipient, setRecipient] = useState(initial.shares?.[0]?.traveller_id ?? travellers.find((t) => t.id !== paidBy)?.id ?? '');

  const amt = parseFloat(amount.replace(/,/g, ''));
  const valid = Number.isFinite(amt) && amt > 0;
  let shares: Share[] = [];
  let problem = '';
  if (isRepay) {
    shares = valid ? [{ traveller_id: recipient, amount: round(amt, currency) }] : [];
    if (recipient === paidBy) problem = 'Pick two different people.';
  } else if (split === 'equal') {
    shares = valid ? equalShares(amt, currency, included) : [];
    if (included.length === 0) problem = 'Pick at least one person.';
  } else {
    shares = travellers.map((t) => ({ traveller_id: t.id, amount: round(parseFloat(custom[t.id] || '0') || 0, currency) })).filter((s) => s.amount > 0);
    const diff = valid ? round(amt - sharesTotal(shares, currency), currency) : 0;
    if (valid && Math.abs(diff) >= 1 / unit(currency)) problem = diff > 0 ? `${formatMoney(diff, currency)} left to assign` : `${formatMoney(-diff, currency)} over the total`;
  }
  const canSave = valid && !problem && paidBy && shares.length > 0;

  const save = async () => {
    if (!canSave) return;
    const row = {
      ...(initial.id ? { id: initial.id } : {}), trip_id: data.trip.id, kind: isRepay ? 'repayment' : 'expense',
      description: isRepay ? 'Repayment' : desc.trim(), amount: round(amt, currency), currency, paid_by: paidBy,
      split_type: isRepay ? 'custom' : split, shares, spent_on: date,
    };
    if (await act(() => backend.save('expenses', row), initial.id ? 'Saved' : isRepay ? 'Repayment recorded' : 'Expense added')) onClose();
  };
  const remove = async () => {
    if (initial.id && confirm('Delete this entry?') && (await act(() => backend.remove('expenses', initial.id!), 'Deleted'))) onClose();
  };
  const toggle = (id: string) => setIncluded(included.includes(id) ? included.filter((x) => x !== id) : [...included, id]);

  return (
    <Sheet title={isRepay ? 'Record repayment' : initial.id ? 'Edit expense' : 'Add expense'} onClose={onClose}
      footer={<>
        {initial.id && <button className="btn btn-danger-ghost" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!canSave} onClick={save}>Save</button>
      </>}>
      {travellers.length < 2 && <p className="warn">Add your travel mates under Settings → Travellers first.</p>}
      {!isRepay && <Field label="What for?"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Villa deposit" autoFocus={!initial.id} /></Field>}
      <div className="row2">
        <Field label="Amount"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
        <Field label="Currency" group><Segmented value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      <div className="row2">
        <Field label={isRepay ? 'From' : 'Paid by'}>
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {isRepay ? (
          <Field label="To">
            <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              {travellers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        ) : <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      </div>
      {!isRepay && (
        <>
          <Field label="Split" group><Segmented value={split} onChange={setSplit} options={[{ value: 'equal', label: 'Equally' }, { value: 'custom', label: 'Custom amounts' }]} /></Field>
          <ul className="split-list">
            {travellers.map((t) => {
              const share = shares.find((s) => s.traveller_id === t.id);
              return (
                <li key={t.id}>
                  {split === 'equal' ? (
                    <label className="check">
                      <input type="checkbox" checked={included.includes(t.id)} onChange={() => toggle(t.id)} />
                      <span>{t.name}</span>
                      <span className="muted">{share ? formatMoney(share.amount, currency) : '—'}</span>
                    </label>
                  ) : (
                    <label className="check">
                      <span>{t.name}</span>
                      <input className="amt-input" inputMode="decimal" value={custom[t.id] ?? ''} placeholder="0"
                        onChange={(e) => setCustom({ ...custom, [t.id]: e.target.value })} />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {problem && <p className="warn">{problem}</p>}
    </Sheet>
  );
}
