import { useEffect, useRef, useState } from 'react';
import { fmtDay, fmtRange, todayISO } from '../lib/dates';
import { itemsInRange, personalRange, sortItems, staysOn, tripDays } from '../lib/itinerary';
import type { Item, SharedItem } from '../lib/types';
import { Icon, useTrip } from '../ui';
import { ItemCard } from './ItemCard';

/** Day-by-day list. Used by members (editable) and on the share page (read-only). */
export function DayList<T extends Item | SharedItem>({ items, start, end, clip, renderActions, onOpen, onAdd, onToggleStatus }: {
  items: T[];
  start: string | null;
  end: string | null;
  /** Only show days inside start–end (a personal view), even if a plan began earlier. */
  clip?: boolean;
  renderActions?: (item: T, dayItems: T[], idx: number) => React.ReactNode;
  onOpen?: (i: T) => void;
  onAdd?: (day: string) => void;
  onToggleStatus?: (i: T) => void;
}) {
  const days = tripDays(start, end, items).filter((d) => !clip || ((!start || d >= start) && (!end || d <= end)));
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
              <span className="day-num">{start && day >= start ? `Day ${n + 1 - days.filter((d) => d < start).length}` : 'Extra'}</span>
              <h2 className="day-date">{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
              {day === today && <span className="today-tag">Today</span>}
            </header>
            {staying.map((s) => (
              <p key={s.id} className="staying"><Icon name="stay" size={16} />{s.status === 'tentative' && !s.location_name ? s.title : `Staying at ${s.location_name || s.title}`}</p>
            ))}
            {dayItems.length > 0 ? (
              <div className="plans">
                {dayItems.map((i, idx) => (
                  <ItemCard key={i.id} item={i} onOpen={onOpen && (() => onOpen(i))}
                    onToggleStatus={onToggleStatus && (() => onToggleStatus(i))}
                    actions={renderActions?.(i, dayItems, idx)} />
                ))}
              </div>
            ) : !onAdd && staying.length === 0 ? <p className="nothing">Nothing planned</p> : null}
            {onAdd && <button className="add-row" onClick={() => onAdd(day)}><Icon name="plus" size={16} />Add to {fmtDay(day, { day: 'numeric', month: 'short' })}</button>}
          </section>
        );
      })}
    </div>
  );
}

export function Itinerary() {
  const { data, act, backend, editItem, offline, me } = useTrip();
  const { trip } = data;
  const mine = personalRange(trip, data.travellers.find((t) => t.user_id === me.id));
  const [showAll, setShowAll] = useState(false);
  const personal = mine.custom && !showAll;
  const start = personal ? mine.start : trip.start_date;
  const end = personal ? mine.end : trip.end_date;
  const items = personal ? itemsInRange(data.items, start, end) : data.items;

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
        <div>
          <h1 className="page-title">Itinerary</h1>
          <p className="page-sub">{personal ? `Your dates ${fmtRange(start, end)} · ` : ''}{items.length} {items.length === 1 ? 'plan' : 'plans'}</p>
          {mine.custom && <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show just your dates' : `Show the full trip (${fmtRange(trip.start_date, trip.end_date)})`}</button>}
        </div>
        {!offline && <button className="btn btn-primary" onClick={() => editItem({ day: trip.start_date ?? todayISO() })}><Icon name="plus" size={16} />Add plan</button>}
      </div>
      <DayList key={personal ? 'mine' : 'all'} items={items} start={start} end={end} clip={personal}
        onOpen={offline ? undefined : (i) => editItem(i)}
        onAdd={offline ? undefined : (day) => editItem({ day })}
        onToggleStatus={offline ? undefined : (i) => void act(() => backend.save('items', { ...i, status: i.status === 'confirmed' ? 'tentative' : 'confirmed' }))}
        renderActions={offline ? undefined : (i, dayItems, idx) => (
          <span className="reorder" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn sm" aria-label="Move up" disabled={idx === 0} onClick={() => move(dayItems, idx, -1)}><Icon name="up" size={16} /></button>
            <button className="icon-btn sm" aria-label="Move down" disabled={idx === dayItems.length - 1} onClick={() => move(dayItems, idx, 1)}><Icon name="down" size={16} /></button>
          </span>
        )} />
    </div>
  );
}
