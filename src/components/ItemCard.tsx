import { useContext } from 'react';
import { fmtDay, fmtTime } from '../lib/dates';
import { directionsUrl, hasLocation, openInMapsUrl } from '../lib/maps';
import { type Item, type SharedItem } from '../lib/types';
import { Ctx, Icon, StatusPill } from '../ui';

interface Props {
  item: Item | SharedItem;
  onOpen?: () => void;
  onToggleStatus?: () => void;
  showDay?: boolean;
  actions?: React.ReactNode;
  /** Hide map links (used for the short "Coming up" list). */
  compact?: boolean;
  /** Highlight the stop on the route line (the next thing happening). */
  next?: boolean;
}

export function timeLabel(i: Item | SharedItem): string {
  if (!i.start_time) return '';
  return i.end_time ? `${fmtTime(i.start_time)} – ${fmtTime(i.end_time)}` : fmtTime(i.start_time);
}

export function MapLinks({ p }: { p: Parameters<typeof openInMapsUrl>[0] }) {
  if (!hasLocation(p)) return null;
  const open = openInMapsUrl(p);
  const dir = directionsUrl(p);
  return (
    <span className="map-links" onClick={(e) => e.stopPropagation()}>
      {open && <a href={open} target="_blank" rel="noreferrer"><Icon name="map" size={16} />Map</a>}
      {dir && <a href={dir} target="_blank" rel="noreferrer"><Icon name="directions" size={16} />Directions</a>}
    </span>
  );
}

/** One plan on the day's route: time, a stop on the dotted line, and the details. */
export function ItemCard({ item, onOpen, onToggleStatus, showDay, actions, compact, next }: Props) {
  const full = item as Item;
  const ctx = useContext(Ctx);
  const audience = full.visible_to && ctx
    ? ctx.data.travellers.filter((t) => full.visible_to!.includes(t.id)).map((t) => t.name).join(', ')
    : null;
  const where = item.location_name || item.address;
  const privateBits = 'booking_ref' in item ? [full.booking_ref && `Ref ${full.booking_ref}`, full.private_notes].filter(Boolean).join(' · ') : '';
  return (
    <div className={`plan kind-${item.kind} ${next ? 'next' : ''}`} onClick={onOpen} role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => onOpen && e.key === 'Enter' && onOpen()}>
      <div className="plan-time">
        {showDay ? (
          <><span>{fmtDay(item.day, { day: 'numeric', month: 'short' })}</span>{item.start_time && <span className="end">{fmtTime(item.start_time)}</span>}</>
        ) : item.start_time ? (
          <>{fmtTime(item.start_time)}{item.end_time && <span className="end">{fmtTime(item.end_time)}</span>}</>
        ) : <span className="muted">–</span>}
      </div>
      <div className="plan-rail"><span className="stop-dot" /></div>
      <div className="plan-body">
        <div className="plan-line1"><Icon name={item.kind} size={16} /><span className="plan-title">{item.title}</span></div>
        <div className="plan-meta">
          {where && <><span>{where}</span><span className="sep">·</span></>}
          <span onClick={(e) => e.stopPropagation()}><StatusPill status={item.status} onClick={onToggleStatus} /></span>
        </div>
        {item.kind === 'stay' && item.end_day && (
          <p className="plan-note">
            Check-in {fmtDay(item.day)}{item.start_time ? `, ${fmtTime(item.start_time)}` : ''} · check-out {fmtDay(item.end_day)}{item.end_time ? `, ${fmtTime(item.end_time)}` : ''}
          </p>
        )}
        {item.notes && <p className="plan-note">{item.notes}</p>}
        {audience && <span className="plan-private"><Icon name="lock" size={14} />Only {audience}</span>}
        {privateBits && <span className="plan-private"><Icon name="lock" size={14} />{privateBits}</span>}
        {(!compact || actions) && (
          <div className="plan-links">
            {!compact && <MapLinks p={item} />}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
