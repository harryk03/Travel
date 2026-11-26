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
  const myPaid = mine.filter((e) => e.paid_by === myId && !(e.shares.length === 1 && e.shares[0].traveller_id === myId)).reduce((a, e) => a + e.amount, 0);
  const myPrivate = mine.filter((e) => e.is_private).reduce((a, e) => a + myShareOf(e), 0);
  const [mineOpen, setMineOpen] = useState(false);
  const isPersonal = (e: Expense) => e.kind === 'expense' && e.paid_by === myId && e.shares.length === 1 && e.shares[0].traveller_id === myId;
  const myItems = mine.filter((e) => myShareOf(e) > 0).sort((a, b) => (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0));
  const myPersonal = myItems.filter(isPersonal).reduce((a, e) => a + e.amount, 0);
  const owedToMe = [...plan, ...privatePlan].filter((x) => x.to === myId);
  const iOwe = [...plan, ...privatePlan].filter((x) => x.from === myId);
  const repayments = expenses.filter((e) => e.kind === 'repayment' && e.currency === currency);
  const received = repayments.filter((e) => e.shares[0]?.traveller_id === myId);
  const sent = repayments.filter((e) => e.paid_by === myId);
  const tag = (e: Expense) => (isPersonal(e) ? 'Personal' : e.is_private ? 'Private' : 'Shared');
  const addPersonal = () => myId && setForm({ kind: 'expense', currency, paid_by: myId, split_type: 'equal', shares: [{ traveller_id: myId, amount: 0 }], is_private: true, description: '' });
  const download = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [['Date', 'What', 'Type', 'Currency', 'Your share', 'Total', 'Paid by']];
    for (const e of [...expenses].filter((x) => x.kind === 'expense' && myShareOf(x) > 0).sort((a, b) => (a.spent_on < b.spent_on ? -1 : 1))) {
      rows.push([e.spent_on, e.description || 'Expense', tag(e), e.currency, String(myShareOf(e)), String(e.amount), name(e.paid_by)]);
    }
    rows.push([]);
    rows.push(['Date', 'Repayment', '', 'Currency', 'Amount', '', '']);
    for (const e of expenses.filter((x) => x.kind === 'repayment' && (x.paid_by === myId || x.shares[0]?.traveller_id === myId))) {
      rows.push([e.spent_on, `${name(e.paid_by)} paid ${name(e.shares[0]?.traveller_id ?? '')}`, e.is_private ? 'Private' : 'Shared', e.currency, String(e.amount), '', '']);
    }
    const blob = new Blob([rows.map((r) => r.map((c) => q(c ?? '')).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(data.trip.name.replace(/[^\w -]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Trip')} - ${myId ? name(myId) : 'my'} spending.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
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
          {myId && (
            <section className={`card spend mine ${mineOpen ? 'open' : ''}`}>
              <button type="button" className="mine-head" onClick={() => setMineOpen(!mineOpen)} aria-expanded={mineOpen}>
                <span>
                  <span className="spend-k">Your spending</span>
                  <span className="spend-v">{formatMoney(myShare, currency)}</span>
                  <span className="spend-note">Your share of everything you’re in{myPrivate > 0 ? `, including ${formatMoney(myPrivate, currency)} private` : ''}</span>
                </span>
                <Icon name={mineOpen ? 'up' : 'down'} size={18} />
              </button>
              <div className="mine-row"><span>You paid upfront</span><span className="amt">{formatMoney(myPaid, currency)}</span></div>
              {owedToMe.length > 0 && !mineOpen && (
                <div className="mine-row"><span>Still owed to you</span><span className="amt pos">{formatMoney(owedToMe.reduce((a, x) => a + x.amount, 0), currency, true)}</span></div>
              )}
              {mineOpen && (
                <div className="mine-detail">
                  <div className="mine-sec">
                    <h3>Still owed to you</h3>
                    {owedToMe.length === 0 ? <p className="muted small">No one owes you anything in {currency}</p> : owedToMe.map((x, i) => (
                      <div key={i} className="mine-line">
                        <span>{name(x.from)}{plan.includes(x) ? '' : <Icon name="lock" size={14} />}</span>
                        <span className="amt pos">{formatMoney(x.amount, currency, true)}</span>
                        {!offline && <button className="btn btn-sm" onClick={() => repay(x, !plan.includes(x))}>Record</button>}
                      </div>
                    ))}
                  </div>
                  {iOwe.length > 0 && (
                    <div className="mine-sec">
                      <h3>You still owe</h3>
                      {iOwe.map((x, i) => (
                        <div key={i} className="mine-line">
                          <span>{name(x.to)}{plan.includes(x) ? '' : <Icon name="lock" size={14} />}</span>
                          <span className="amt">{formatMoney(x.amount, currency, true)}</span>
                          {!offline && <button className="btn btn-sm" onClick={() => repay(x, !plan.includes(x))}>Record</button>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mine-sec">
                    <h3>Money received</h3>
                    {received.length === 0 ? <p className="muted small">Nothing received yet</p> : received.map((e) => (
                      <div key={e.id} className="mine-line" role="button" tabIndex={0} onClick={offline ? undefined : () => setForm(e)}>
                        <span>{name(e.paid_by)} sent you<span className="when">{fmtDay(e.spent_on)}</span></span>
                        <span className="amt pos">{formatMoney(e.amount, currency)}</span>
                      </div>
                    ))}
                  </div>
                  {sent.length > 0 && (
                    <div className="mine-sec">
                      <h3>Money sent</h3>
                      {sent.map((e) => (
                        <div key={e.id} className="mine-line" role="button" tabIndex={0} onClick={offline ? undefined : () => setForm(e)}>
                          <span>You sent {name(e.shares[0]?.traveller_id ?? '')}<span className="when">{fmtDay(e.spent_on)}</span></span>
                          <span className="amt">{formatMoney(e.amount, currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mine-sec">
                    <h3>Your spending, item by item</h3>
                    {myPersonal > 0 && <p className="muted small">Personal spending {formatMoney(myPersonal, currency)}</p>}
                    {myItems.length === 0 ? <p className="muted small">Nothing yet</p> : myItems.map((e) => (
                      <div key={e.id} className="mine-line item" role="button" tabIndex={0} onClick={offline ? undefined : () => setForm(e)}>
                        <span>
                          {e.description || 'Expense'}
                          <span className="when">{fmtDay(e.spent_on)} · {tag(e)}{e.paid_by === myId && !isPersonal(e) ? ' · you paid' : ''}</span>
                        </span>
                        <span className="amt">{formatMoney(myShareOf(e), currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="btn-row">
                    {!offline && <button className="btn btn-primary btn-sm" onClick={addPersonal}><Icon name="plus" size={16} />Add personal expense</button>}
                    <button className="btn btn-sm" onClick={download}>Download my spending</button>
                  </div>
                  <p className="muted small">Personal expenses are only visible to you and don’t affect anyone else’s balances. The download covers AUD and IDR.</p>
                </div>
              )}
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
