import { addDays, fmtDay, todayISO, tripPhase } from '../lib/dates';
import { currentAndUpcomingStays, lastNight, sortItems } from '../lib/itinerary';
import type { Item, SharedItem } from '../lib/types';
import { Empty, StatusPill } from '../ui';
import { BookingLinks, ItemCard, MapLinks } from './ItemCard';

const short = (s: string) => fmtDay(s, { day: 'numeric', month: 'short' });

function PassFigure({ start, end }: { start: string | null; end: string | null }) {
  const p = tripPhase(start, end);
  if (p.phase === 'before') return <div className="pass-day"><b>{p.days}</b><span>{p.days === 1 ? 'day to go' : 'days to go'}</span></div>;
  if (p.phase === 'during') return <div className="pass-day"><b>Day {p.day}</b><span>of {p.total}</span></div>;
  if (p.phase === 'after') return <div className="pass-day"><b>Home</b><span>trip finished</span></div>;
  return <div className="pass-day"><span>Set the trip dates in settings</span></div>;
}

interface Props<T extends Item | SharedItem> {
  items: T[];
  start: string | null;
  end: string | null;
  name?: string;
  subtitle?: string;
  onOpen?: (i: T) => void;
  onToggleStatus?: (i: T) => void;
}

/** Shared between the member Overview tab and the public share page. */
export function OverviewBody<T extends Item | SharedItem>({ items, start, end, name, subtitle, onOpen, onToggleStatus }: Props<T>) {
  const today = todayISO();
  const { current, upcoming } = currentAndUpcomingStays(items, today);
  const sorted = sortItems(items.filter((i) => i.kind !== 'stay' || i.day >= today));
  const todays = sorted.filter((i) => i.day === today);
  const beforeTrip = !!start && today < start;
  const next = sorted.filter((i) => i.day > today).slice(0, 5);
  const stays = sortItems(items.filter((i) => i.kind === 'stay'));
  const tonight = current[0] ?? (beforeTrip ? upcoming[0] : undefined);
  const route = stays.map((s) => ({
    s, k: short(s.day), v: s.location_name ? (s.location_name.split(',').pop() || s.location_name).trim() : s.status === 'tentative' ? 'To book' : s.title,
    cls: current.includes(s) ? 'now' : lastNight(s) < today ? 'done' : s.status === 'tentative' ? 'tbc' : '',
  }));

  return (
    <>
      <section className="pass" aria-label="Trip pass">
        <div className="pass-main">
          <div className="pass-top"><span>Trip pass</span>{start && <span>{short(start)} → {short(end ?? start)}</span>}</div>
          {name && <h1 className="pass-title">{name}</h1>}
          {subtitle && <p className="pass-dates">{subtitle}</p>}
          <PassFigure start={start} end={end} />
          {route.length > 0 && (
            <div className="route">
              {route.map((r) => (
                <div key={r.s.id} className={`stop ${r.cls}`}><span className="pin" /><span className="k">{r.k}</span><span className="v">{r.v}</span></div>
              ))}
              {end && <div className="stop home"><span className="pin" /><span className="k">{short(end)}</span><span className="v">Home</span></div>}
            </div>
          )}
        </div>
        <div className="pass-stub" onClick={tonight && onOpen ? () => onOpen(tonight) : undefined} role={tonight && onOpen ? 'button' : undefined}>
          <p className="stub-k">{current[0] ? 'Tonight' : beforeTrip ? 'First night' : 'Tonight'}</p>
          {tonight ? (
            <>
              <p className="stub-v">{tonight.title}</p>
              <p className="stub-sub">{tonight.location_name ? `${tonight.location_name} · ` : ''}until {fmtDay(addDays(lastNight(tonight), 1))}</p>
              <div className="stub-links"><MapLinks p={tonight} /><BookingLinks item={tonight} /></div>
            </>
          ) : <p className="stub-sub">No accommodation for tonight yet</p>}
        </div>
      </section>

      <div className="ov-grid">
        <div>
          <section className="section">
            <div className="section-head"><h2 className="section-title">Today</h2><span className="section-meta">{fmtDay(today)}</span></div>
            {todays.length === 0 ? (
              <p className="muted">{beforeTrip ? 'The trip hasn’t started yet' : 'Nothing planned today'}</p>
            ) : (
              <div className="plans">
                {todays.map((i, n) => <ItemCard key={i.id} item={i} next={n === 0} onOpen={onOpen && (() => onOpen(i))} onToggleStatus={onToggleStatus && (() => onToggleStatus(i))} />)}
              </div>
            )}
          </section>
          <section className="section">
            <div className="section-head"><h2 className="section-title">Coming up</h2>{next.length > 0 && <span className="section-meta">Next {next.length}</span>}</div>
            {next.length === 0 ? <Empty title="Nothing else planned yet" /> : (
              <div className="plans">
                {next.map((i) => <ItemCard key={i.id} item={i} showDay compact onOpen={onOpen && (() => onOpen(i))} onToggleStatus={onToggleStatus && (() => onToggleStatus(i))} />)}
              </div>
            )}
          </section>
        </div>

        <section className="section stays-col">
          <div className="section-head"><h2 className="section-title">Where you’re staying</h2><span className="section-meta">{stays.length} {stays.length === 1 ? 'stay' : 'stays'}</span></div>
          {stays.length === 0 ? <p className="muted">No accommodation added yet</p> : (
            <div className="card stays">
              {stays.map((s) => {
                const isNow = current.includes(s);
                const past = lastNight(s) < today;
                return (
                  <div key={s.id} className={`stay ${onOpen ? 'clickable' : ''}`} onClick={onOpen && (() => onOpen(s))} role={onOpen ? 'button' : undefined}>
                    <span className={`stay-k ${isNow ? 'now' : ''}`}>{isNow ? 'Staying now' : past ? 'Stayed' : 'From'} · {short(s.day)}{s.end_day ? ` – ${short(s.end_day)}` : ''}</span>
                    <span className="stay-title">{s.title}</span>
                    <StatusPill status={s.status} />
                    <span className="stay-sub">{s.location_name || 'Location not set'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
