import { useEffect, useRef } from 'react';
import { fmtDay, todayISO } from '../lib/dates';
import { sortItems, staysOn, tripDays } from '../lib/itinerary';
import type { Item, SharedItem } from '../lib/types';
import { useTrip } from '../ui';
import { ItemCard } from './ItemCard';

/** Day-by-day list. Used by members (editable) and on the share page (read-only). */
export function DayList<T extends Item | SharedItem>({ items, start, end, renderActions, onOpen, onAdd, onToggleStatus }: {
  items: T[];
  start: string | null;
  end: string | null;
  renderActions?: (item: T, dayItems: T[], idx: number) => React.ReactNode;
  onOpen?: (i: T) => void;
  onAdd?: (day: string) => void;
  onToggleStatus?: (i: T) => void;
}) {
  const days = tripDays(start, end, items);
  const today = todayISO();
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <div className="days">
      {days.map((day, n) => {
        const dayItems = sortItems(items.filter((i) => i.day === day));
        const staying = staysOn(items, day).filter((s) => s.day !== day);
        return (
          <section key={day} className={`day ${day === today ? 'is-today' : ''}`} ref={day === today ? todayRef : undefined}>
            <header className="day-head">
              <div>
                <span className="day-num">{start && day >= start ? `Day ${n + 1 - days.filter((d) => d < start).length}` : 'Extra day'}</span>
                <span className="day-date">{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}</span>
              </div>
              {day === today && <span className="today-chip">Today</span>}
            </header>
            {staying.map((s) => (
              <div key={s.id} className="staying-line">🛏️ Staying at <strong>{s.location_name || s.title}</strong></div>
            ))}
            <div className="stack">
              {dayItems.map((i, idx) => (
                <ItemCard key={i.id} item={i} onOpen={onOpen && (() => onOpen(i))}
                  onToggleStatus={onToggleStatus && (() => onToggleStatus(i))}
                  actions={renderActions?.(i, dayItems, idx)} />
              ))}
              {dayItems.length === 0 && <p className="muted small">Nothing planned.</p>}
            </div>
            {onAdd && <button className="add-row" onClick={() => onAdd(day)}>+ Add to {fmtDay(day)}</button>}
          </section>
        );
      })}
    </div>
  );
}

export function Itinerary() {
  const { data, act, backend, editItem, offline } = useTrip();
  const { trip, items } = data;

  const move = (dayItems: Item[], idx: number, dir: -1 | 1) => {
    const other = dayItems[idx + dir];
    const cur = dayItems[idx];
    if (!other) return;
    // Swap positions (break ties so the order always changes).
    const a = other.position === cur.position ? cur.position + dir : other.position;
    void act(() => backend.saveMany('items', [{ ...cur, position: a }, { ...other, position: cur.position }]));
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Itinerary</h1>
        {!offline && <button className="btn btn-primary" onClick={() => editItem({ day: trip.start_date ?? todayISO() })}>+ Add plan</button>}
      </div>
      <DayList items={items} start={trip.start_date} end={trip.end_date}
        onOpen={offline ? undefined : (i) => editItem(i)}
        onAdd={offline ? undefined : (day) => editItem({ day })}
        onToggleStatus={offline ? undefined : (i) => void act(() => backend.save('items', { ...i, status: i.status === 'confirmed' ? 'tentative' : 'confirmed' }))}
        renderActions={offline ? undefined : (i, dayItems, idx) => (
          <span className="reorder" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sm" aria-label="Move up" disabled={idx === 0} onClick={() => move(dayItems, idx, -1)}>↑</button>
            <button className="icon-btn sm" aria-label="Move down" disabled={idx === dayItems.length - 1} onClick={() => move(dayItems, idx, 1)}>↓</button>
          </span>
        )} />
    </div>
  );
}
