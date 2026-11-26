import { fmtDay, fmtTime } from '../lib/dates';
import { directionsUrl, hasLocation, openInMapsUrl } from '../lib/maps';
import { KIND_META, type Item, type SharedItem } from '../lib/types';
import { useContext } from 'react';
import { Ctx, StatusPill } from '../ui';

interface Props {
  item: Item | SharedItem;
  onOpen?: () => void;
  onToggleStatus?: () => void;
  showDay?: boolean;
  actions?: React.ReactNode;
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
      {open && <a href={open} target="_blank" rel="noreferrer">Map</a>}
      {dir && <a href={dir} target="_blank" rel="noreferrer">Directions</a>}
    </span>
  );
}

export function ItemCard({ item, onOpen, onToggleStatus, showDay, actions }: Props) {
  const meta = KIND_META[item.kind];
  const full = item as Item;
  const ctx = useContext(Ctx);
  const audience = full.visible_to && ctx
    ? ctx.data.travellers.filter((t) => full.visible_to!.includes(t.id)).map((t) => t.name).join(', ')
    : null;
  return (
    <div className={`card item-card kind-${item.kind} status-${item.status}`} onClick={onOpen} role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined} onKeyDown={(e) => onOpen && (e.key === 'Enter') && onOpen()}>
      <div className="item-emoji" aria-hidden="true">{meta.emoji}</div>
      <div className="item-main">
        <div className="item-top">
          {(showDay || item.start_time) && (
            <span className="item-time">{showDay && fmtDay(item.day)}{showDay && item.start_time && ' · '}{timeLabel(item)}</span>
          )}
          <span onClick={(e) => e.stopPropagation()}><StatusPill status={item.status} onClick={onToggleStatus} /></span>
        </div>
        <div className="item-title">{item.title}</div>
        {item.kind === 'stay' && item.end_day && (
          <div className="item-sub">Check-in {fmtDay(item.day)} · Check-out {fmtDay(item.end_day)}</div>
        )}
        {(item.location_name || item.address) && (
          <div className="item-sub">📍 {item.location_name || item.address}</div>
        )}
        {audience && <div className="item-audience">🔒 Only {audience}</div>}
        {item.notes && <div className="item-notes">{item.notes}</div>}
        {'booking_ref' in item && (full.booking_ref || full.private_notes) && (
          <div className="item-private">🔒 {[full.booking_ref && `Ref ${full.booking_ref}`, full.private_notes].filter(Boolean).join(' · ')}</div>
        )}
        <div className="item-foot">
          <MapLinks p={item} />
          {actions}
        </div>
      </div>
    </div>
  );
}
