import { fmtDay, fmtRange, todayISO, tripPhase } from '../lib/dates';
import { currentAndUpcomingStays, sortItems } from '../lib/itinerary';
import type { Item, SharedItem } from '../lib/types';
import { Empty } from '../ui';
import { ItemCard, MapLinks } from './ItemCard';

export function Countdown({ start, end }: { start: string | null; end: string | null }) {
  const p = tripPhase(start, end);
  let big = '';
  let small = '';
  if (p.phase === 'before') {
    big = String(p.days);
    small = p.days === 1 ? 'day to go' : 'days to go';
  } else if (p.phase === 'during') {
    big = `Day ${p.day}`;
    small = `of ${p.total}`;
  } else if (p.phase === 'after') {
    big = 'Done';
    small = 'hope it was a good one';
  } else {
    big = '—';
    small = 'set trip dates';
  }
  return (
    <div className="countdown">
      <span className="countdown-big">{big}</span>
      <span className="countdown-small">{small}</span>
    </div>
  );
}

interface Props<T extends Item | SharedItem> {
  items: T[];
  start: string | null;
  end: string | null;
  onOpen?: (i: T) => void;
  onToggleStatus?: (i: T) => void;
}

/** Shared between the member Overview tab and the public share page. */
export function OverviewBody<T extends Item | SharedItem>({ items, start, end, onOpen, onToggleStatus }: Props<T>) {
  const today = todayISO();
  const { current, upcoming } = currentAndUpcomingStays(items, today);
  const sorted = sortItems(items.filter((i) => i.kind !== 'stay' || i.day >= today));
  const todays = sorted.filter((i) => i.day === today);
  const firstDay = start && today < start ? start : null;
  const next = sorted.filter((i) => i.day > today).slice(0, 5);

  return (
    <>
      <section className="ov-hero card">
        <div>
          <div className="ov-label">Trip dates</div>
          <div className="ov-dates">{fmtRange(start, end)}</div>
        </div>
        <Countdown start={start} end={end} />
      </section>

      <section>
        <h3 className="section-title">🏨 Accommodation</h3>
        {current.length === 0 && upcoming.length === 0 && <p className="muted">No accommodation added yet.</p>}
        <div className="stack">
          {current.map((s) => <StayCard key={s.id} s={s} label="Staying now" onOpen={onOpen} />)}
          {upcoming.slice(0, 3).map((s) => <StayCard key={s.id} s={s} label={`From ${fmtDay(s.day)}`} onOpen={onOpen} />)}
        </div>
      </section>

      <section>
        <h3 className="section-title">☀️ Today{firstDay ? '' : ` · ${fmtDay(today)}`}</h3>
        {todays.length === 0 ? (
          <p className="muted">{firstDay ? 'The trip hasn’t started yet.' : 'Nothing planned today. Enjoy the free time.'}</p>
        ) : (
          <div className="stack">
            {todays.map((i) => <ItemCard key={i.id} item={i} onOpen={onOpen && (() => onOpen(i))} onToggleStatus={onToggleStatus && (() => onToggleStatus(i))} />)}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title">⏭️ Coming up</h3>
        {next.length === 0 ? <Empty emoji="🗓️" title="Nothing else planned yet" /> : (
          <div className="stack">
            {next.map((i) => <ItemCard key={i.id} item={i} showDay onOpen={onOpen && (() => onOpen(i))} onToggleStatus={onToggleStatus && (() => onToggleStatus(i))} />)}
          </div>
        )}
      </section>
    </>
  );
}

function StayCard<T extends Item | SharedItem>({ s, label, onOpen }: { s: T; label: string; onOpen?: (i: T) => void }) {
  return (
    <div className="card stay-card" onClick={onOpen && (() => onOpen(s))} role={onOpen ? 'button' : undefined}>
      <div className="stay-label">{label}</div>
      <div className="stay-title">{s.title}</div>
      <div className="item-sub">
        {fmtDay(s.day)}{s.end_day ? ` → ${fmtDay(s.end_day)}` : ''}{s.location_name ? ` · ${s.location_name}` : ''}
      </div>
      <div className="item-foot"><MapLinks p={s} />{s.status === 'tentative' && <span className="pill pill-tentative">? Tentative</span>}</div>
    </div>
  );
}
