import { useMemo, useState } from 'react';
import { fmtDay, todayISO } from '../lib/dates';
import { balances, CURRENCIES, equalShares, formatMoney, round, roundUpOwed, settleUp, sharesTotal, unit, type Settlement } from '../lib/money';
import type { Currency, Expense, Share } from '../lib/types';
import { Empty, Field, Icon, Segmented, Sheet, useTrip } from '../ui';

export function Expenses() {
  const { data, offline, me } = useTrip();
  const { expenses, travellers } = data;
  const myId = travellers.find((t) => t.user_id === me.id)?.id;
  const [currency, setCurrency] = useState<Currency>(() => (expenses[0]?.currency ?? 'AUD'));
  const [form, setForm] = useState<Partial<Expense> | null>(null);
  const name = (id: string) => travellers.find((t) => t.id === id)?.name ?? 'Removed traveller';

  // Shared (group) money and private money are settled separately, so everyone sees the same group figures
  // and private debts only ever appear to the people involved.
  const shared = useMemo(() => expenses.filter((e) => !e.is_private), [expenses]);
  const priv = useMemo(() => expenses.filter((e) => e.is_private), [expenses]);
  const net = useMemo(() => balances(shared, travellers), [shared, travellers]);
  const order = (id: string) => travellers.findIndex((t) => t.id === id);
  const sortPlan = (p: Settlement[]) => p.sort((a, b) => order(a.from) - order(b.from) || order(a.to) - order(b.to));
  const plan = useMemo(() => sortPlan(settleUp(shared, currency)), [shared, travellers, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const privatePlan = useMemo(() => sortPlan(settleUp(priv, currency)), [priv, travellers, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const spent = shared.filter((e) => e.kind === 'expense' && e.currency === currency);
  const mine = expenses.filter((e) => e.kind === 'expense' && e.currency === currency);
  const myShareOf = (e: Expense) => e.shares.find((s) => s.traveller_id === myId)?.amount ?? 0;
  const myShare = mine.reduce((a, e) => a + myShareOf(e), 0);
  const myPaid = mine.filter((e) => e.paid_by === myId).reduce((a, e) => a + e.amount, 0);
  const myPrivate = mine.filter((e) => e.is_private).reduce((a, e) => a + myShareOf(e), 0);
  const total = spent.reduce((s, e) => s + e.amount, 0);
  const paid = new Map<string, number>();
  spent.forEach((e) => paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + e.amount));
  const payers = [...paid.entries()].sort((a, b) => b[1] - a[1]);
  const shades = ['var(--accent)', 'var(--text2)', 'var(--muted)', 'var(--line-strong)'];
  const shown = expenses;

  const repay = (s: Settlement, isPrivate = false) => setForm({
    kind: 'repayment', amount: s.amount, currency: s.currency, paid_by: s.from, split_type: 'custom',
    shares: [{ traveller_id: s.to, amount: s.amount }], description: 'Repayment', is_private: isPrivate,
  });
  const people = (e: Expense) => [...new Set([e.paid_by, ...e.shares.map((s) => s.traveller_id)])].map(name).join(', ');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Expenses</h1><p className="page-sub">Everyone pays back whoever paid</p></div>
        {!offline && <button className="btn btn-primary" onClick={() => setForm({ kind: 'expense', currency })}><Icon name="plus" size={16} />Add expense</button>}
      </div>

      <Segmented value={currency} onChange={setCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />

      <div className="ex-grid">
        <div>
          {myId && (myShare > 0 || myPaid > 0) && (
            <section className="card spend mine">
              <p className="spend-k">Your spending</p>
              <p className="spend-v">{formatMoney(myShare, currency)}</p>
              <p className="spend-note">Your share of everything you’re in{myPrivate > 0 ? `, including ${formatMoney(myPrivate, currency)} private` : ''}</p>
              <div className="mine-row"><span>You paid upfront</span><span className="amt">{formatMoney(myPaid, currency)}</span></div>
            </section>
          )}
          <section className="card spend">
            <p className="spend-k">Group spend</p>
            <p className="spend-note">Shared costs only. Private expenses aren’t included</p>
            <p className="spend-v">{formatMoney(total, currency)}</p>
            {payers.length > 0 && (
              <>
                <div className="paidbar" aria-hidden="true">
                  {payers.map(([id, v], i) => <span key={id} style={{ flex: v, background: shades[Math.min(i, 3)] }} />)}
                </div>
                <div className="legend">
                  {payers.map(([id, v], i) => <span key={id}><i style={{ background: shades[Math.min(i, 3)] }} />{name(id)} paid<b>{formatMoney(v, currency, true)}</b></span>)}
                </div>
              </>
            )}
            <div className="balances">
              {travellers.map((t) => {
                const v = net[currency][t.id] ?? 0;
                const owed = roundUpOwed(v, currency);
                return (
                  <div key={t.id} className="bal">
                    <span>{t.name}</span>
                    <span className={`amt ${owed === 0 ? 'muted' : v > 0 ? 'pos' : 'neg'}`}>
                      {owed === 0 ? 'settled' : v > 0 ? `gets back ${formatMoney(owed, currency, true)}` : `owes ${formatMoney(owed, currency, true)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-head"><h2 className="section-title">All expenses</h2><span className="section-meta">{shown.length}</span></div>
            {shown.length === 0 ? <Empty title="No expenses yet" /> : (
              <div className="list">
                {shown.map((e) => (
                  <div key={e.id} className={`exp ${e.kind}`} role="button" tabIndex={0} onClick={offline ? undefined : () => setForm(e)}
                    onKeyDown={(ev) => !offline && ev.key === 'Enter' && setForm(e)}>
                    <span className="exp-title">{e.kind === 'repayment' ? `${name(e.paid_by)} paid ${name(e.shares[0]?.traveller_id ?? '')}` : e.description || 'Expense'}</span>
                    <span className="exp-amt">{formatMoney(e.amount, e.currency)}</span>
                    <span className="exp-sub">
                      {e.kind === 'repayment' ? 'Repayment' : `Paid by ${name(e.paid_by)} · ${e.split_type === 'equal' ? `split ${e.shares.length} ways` : 'custom split'}`} · {fmtDay(e.spent_on)}
                    </span>
                    {e.is_private && <span className="exp-private"><Icon name="lock" size={14} />Private · {people(e)}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="section ledger-col">
          <div className="section-head"><h2 className="section-title">Who pays who</h2><span className="section-meta">Rounded up</span></div>
          {plan.length === 0 && privatePlan.length === 0 ? <p className="muted">Everyone’s square in {currency}</p> : (
            <div className="ledger">
              {plan.map((s, i) => (
                <div key={'g' + i} className="owe">
                  <span className="who">{name(s.from)}<span className="arrow">→</span>{name(s.to)}</span>
                  <span className="amt">{formatMoney(s.amount, s.currency, true)}</span>
                  {!offline && <button className="btn btn-sm" onClick={() => repay(s)}>Record</button>}
                </div>
              ))}
              {privatePlan.map((s, i) => (
                <div key={'p' + i} className="owe private">
                  <span className="who"><Icon name="lock" size={14} />{name(s.from)}<span className="arrow">→</span>{name(s.to)}</span>
                  <span className="amt">{formatMoney(s.amount, s.currency, true)}</span>
                  {!offline && <button className="btn btn-sm" onClick={() => repay(s, true)}>Record</button>}
                </div>
              ))}
            </div>
          )}
          {privatePlan.length > 0 && <p className="ledger-note"><Icon name="lock" size={14} />Private lines are only visible to the two people in them</p>}
        </section>
      </div>

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
  const [isPrivate, setIsPrivate] = useState(initial.is_private ?? false);

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
  const involvedNames = [...new Set([paidBy, ...shares.map((s) => s.traveller_id)])]
    .map((id) => travellers.find((t) => t.id === id)?.name).filter(Boolean).join(', ');

  const save = async () => {
    if (!canSave) return;
    const row = {
      ...(initial.id ? { id: initial.id } : {}), trip_id: data.trip.id, kind: isRepay ? 'repayment' : 'expense',
      description: isRepay ? 'Repayment' : desc.trim(), amount: round(amt, currency), currency, paid_by: paidBy,
      split_type: isRepay ? 'custom' : split, shares, spent_on: date,
      // Only sent when used, so saving still works before the database has the column.
      ...(isPrivate || initial.is_private ? { is_private: isPrivate } : {}),
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
      <Field label="Who can see this" group hint={isPrivate
        ? `Only ${involvedNames || 'the people involved'} can see it. It isn’t added to the group spend`
        : 'Everyone in the trip. Counts toward the group spend'}>
        <Segmented value={isPrivate ? 'private' : 'everyone'} onChange={(v) => setIsPrivate(v === 'private')}
          options={[{ value: 'everyone', label: 'Everyone' }, { value: 'private', label: 'Only the people involved' }]} />
      </Field>
      {problem && <p className="warn">{problem}</p>}
    </Sheet>
  );
}
