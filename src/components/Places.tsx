import { useState } from 'react';
import { fmtDay } from '../lib/dates';
import { extractUrl, isGoogleMapsUrl, parseMapsUrl, resolveShortLink, safeHttpUrl } from '../lib/maps';
import { CATEGORY_META, type InboxItem, type Place, type PlaceCategory } from '../lib/types';
import { Empty, Field, Icon, Sheet, useTrip } from '../ui';
import { MapLinks } from './ItemCard';

const CATS = Object.keys(CATEGORY_META) as PlaceCategory[];

function guessCategory(name: string): PlaceCategory {
  const n = name.toLowerCase();
  if (/gym|fitness|crossfit|yoga/.test(n)) return 'gym';
  if (/caf[eé]|coffee|espresso|roast/.test(n)) return 'cafe';
  if (/beach club|beachclub/.test(n)) return 'beach_club';
  if (/bar|club|lounge|pub/.test(n)) return 'nightlife';
  if (/villa|hotel|resort|hostel|guesthouse|airbnb/.test(n)) return 'stay';
  if (/restaurant|warung|kitchen|grill|eat|bistro|pizza|sushi/.test(n)) return 'restaurant';
  if (/temple|waterfall|trek|surf|tour|park|rice|dive/.test(n)) return 'activity';
  return 'other';
}

export function Places() {
  const { data, editItem, offline, backend, act } = useTrip();
  const [filter, setFilter] = useState<PlaceCategory | 'all'>('all');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [form, setForm] = useState<Partial<Place> | null>(null);
  const [fromInbox, setFromInbox] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const inbox = data.inbox;
  const fresh = inbox?.filter((x) => x.status === 'new') ?? [];
  const dismissed = inbox?.filter((x) => x.status === 'dismissed') ?? [];
  const addFromInbox = (x: InboxItem) => {
    const label = x.note ?? '';
    setFromInbox(x.id);
    setForm({ name: label, category: guessCategory(`${label} ${x.caption ?? ''}`), source_url: x.url });
  };
  const setStatus = (x: InboxItem, status: InboxItem['status']) =>
    act(() => backend.updateInbox(x.id, { status }), status === 'dismissed' ? 'Dismissed' : 'Back in the inbox');

  const counts = CATS.reduce((m, c) => ({ ...m, [c]: data.places.filter((p) => p.category === c).length }), {} as Record<PlaceCategory, number>);
  const shown = data.places.filter((p) => filter === 'all' || p.category === filter);

  const fromLink = async () => {
    const url = extractUrl(paste);
    if (!url) return setHint('That doesn’t look like a link. You can add the place manually instead.');
    setBusy(true);
    setHint('');
    let parsed = parseMapsUrl(url);
    if (parsed?.isShortLink && backend.mode === 'cloud') {
      const full = await resolveShortLink(url);
      if (full) parsed = { ...(parseMapsUrl(full) ?? parsed), url, isShortLink: false };
    }
    setBusy(false);
    const name = parsed?.name ?? '';
    if (!isGoogleMapsUrl(url)) setHint('Not a Google Maps link, but you can still save it.');
    else if (!name && parsed?.lat == null) setHint('Couldn’t read details from that link. Fill in the name below.');
    setForm({ name, maps_url: url, lat: parsed?.lat ?? null, lng: parsed?.lng ?? null, category: guessCategory(name) });
    setPaste('');
  };

  const addToItinerary = (p: Place) =>
    editItem({
      title: p.name, kind: CATEGORY_META[p.category].kind, location_name: p.name, address: p.address,
      maps_url: p.maps_url, lat: p.lat, lng: p.lng, place_id: p.id,
    });

  return (
    <div className="page">
      <div className="page-head"><h1>Saved places</h1></div>

      {!offline && (
        <div className="card paste-card">
          <form onSubmit={(e) => { e.preventDefault(); void fromLink(); }}>
            <label className="field-label" htmlFor="paste">Paste a Google Maps link</label>
            <div className="paste-row">
              <input id="paste" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://maps.app.goo.gl/…" inputMode="url" />
              <button className="btn btn-primary" disabled={!paste.trim() || busy}>{busy ? '…' : 'Add'}</button>
            </div>
          </form>
          {hint && <p className="field-hint">{hint}</p>}
          <button className="link-btn" onClick={() => setForm({ category: 'other' })}>or add a place manually</button>
        </div>
      )}

      {inbox && (fresh.length > 0 || (showDismissed && dismissed.length > 0)) && (
        <section className="inbox" aria-label="Inbox">
          <div className="section-head">
            <h2 className="section-title">Inbox</h2>
            <span className="section-meta">{fresh.length} new</span>
          </div>
          <div className="inbox-list">
            {fresh.map((x) => <InboxRow key={x.id} x={x} offline={offline} onAdd={() => addFromInbox(x)} onDismiss={() => setStatus(x, 'dismissed')} />)}
            {showDismissed && dismissed.map((x) => <InboxRow key={x.id} x={x} offline={offline} onRestore={() => setStatus(x, 'new')} />)}
          </div>
        </section>
      )}
      {inbox && dismissed.length > 0 && (
        <button className="link-btn inbox-toggle" onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed.length})`}
        </button>
      )}

      <div className="chips" role="tablist">
        <button className={filter === 'all' ? 'chip on' : 'chip'} onClick={() => setFilter('all')}>All {data.places.length}</button>
        {CATS.filter((c) => counts[c] > 0).map((c) => (
          <button key={c} className={filter === c ? 'chip on' : 'chip'} onClick={() => setFilter(c)}>
            {CATEGORY_META[c].emoji} {CATEGORY_META[c].label} {counts[c]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty emoji="📍" title="No places saved yet">
          <p className="muted small">In Google Maps tap Share → Copy link, then paste it above.</p>
        </Empty>
      ) : (
        <div className="place-grid">
          {shown.map((p) => (
            <div key={p.id} className="card place-card" onClick={offline ? undefined : () => setForm(p)} role="button" tabIndex={0}>
              <div className="place-emoji">{CATEGORY_META[p.category].emoji}</div>
              <div className="place-main">
                <div className="item-title">{p.name}</div>
                {p.address && <div className="item-sub">{p.address}</div>}
                {p.notes && <div className="item-notes">{p.notes}</div>}
                <div className="item-foot" onClick={(e) => e.stopPropagation()}>
                  <MapLinks p={p} />
                  {safeHttpUrl(p.source_url) && (
                    <a className="post-link" href={safeHttpUrl(p.source_url)!} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Post</a>
                  )}
                  {!offline && <button className="link-btn" onClick={() => addToItinerary(p)}>+ Itinerary</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && <PlaceForm initial={form} inboxId={fromInbox} onClose={() => { setForm(null); setFromInbox(null); }} onSaved={() => { setForm(null); setFromInbox(null); }}
        onRemove={form.id ? () => act(() => backend.remove('places', form.id!), 'Place removed').then((ok) => ok && setForm(null)) : undefined} />}
    </div>
  );
}

function InboxRow({ x, offline, onAdd, onDismiss, onRestore }: { x: InboxItem; offline: boolean; onAdd?: () => void; onDismiss?: () => void; onRestore?: () => void }) {
  const url = safeHttpUrl(x.url);
  const short = url ? url.replace(/^https?:\/\/(www\.)?/, '') : x.url;
  return (
    <div className={`inbox-row ${x.status}`}>
      <span className="inbox-icon"><Icon name={x.source === 'other' ? 'link' : x.source} size={16} /></span>
      <div className="inbox-main">
        <p className="inbox-title">{x.note || x.caption || short}</p>
        {x.note && x.caption && <p className="inbox-caption">{x.caption}</p>}
        <p className="inbox-meta">{x.source === 'instagram' ? 'Instagram' : x.source === 'tiktok' ? 'TikTok' : short.split('/')[0]} · {fmtDay(x.created_at.slice(0, 10))}{x.status === 'dismissed' ? ' · dismissed' : ''}</p>
        <div className="inbox-actions">
          {url && <a href={url} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Open</a>}
          {!offline && onAdd && <button className="btn btn-sm" onClick={onAdd}>Add as place</button>}
          {!offline && onDismiss && <button className="link-btn" onClick={onDismiss}>Dismiss</button>}
          {!offline && onRestore && <button className="link-btn" onClick={onRestore}>Restore</button>}
        </div>
      </div>
    </div>
  );
}

function PlaceForm({ initial, inboxId, onClose, onSaved, onRemove }: { initial: Partial<Place>; inboxId?: string | null; onClose: () => void; onSaved: () => void; onRemove?: () => void }) {
  const { data, act, backend } = useTrip();
  const [f, setF] = useState({
    name: initial.name ?? '', category: initial.category ?? ('other' as PlaceCategory), address: initial.address ?? '',
    maps_url: initial.maps_url ?? '', notes: initial.notes ?? '',
  });
  const save = async () => {
    const parsed = f.maps_url && f.maps_url !== initial.maps_url ? parseMapsUrl(f.maps_url) : null;
    const row = {
      ...(initial.id ? { id: initial.id } : {}), trip_id: data.trip.id, name: f.name.trim(), category: f.category,
      address: f.address.trim() || null, maps_url: f.maps_url.trim() || null, notes: f.notes.trim() || null,
      lat: parsed ? parsed.lat : initial.lat ?? null, lng: parsed ? parsed.lng : initial.lng ?? null,
      // Only sent when used, so saving still works before migration 007 has run.
      ...(initial.source_url ? { source_url: safeHttpUrl(initial.source_url) } : {}),
    };
    const ok = await act(async () => {
      const placeId = await backend.save('places', row);
      if (inboxId) await backend.updateInbox(inboxId, { status: 'added', place_id: placeId });
    }, initial.id ? 'Saved' : inboxId ? 'Place saved from the inbox' : 'Place saved');
    if (ok) onSaved();
  };
  return (
    <Sheet title={initial.id ? 'Edit place' : 'Save place'} onClose={onClose}
      footer={<>
        {onRemove && <button className="btn btn-danger-ghost" onClick={() => confirm('Remove this place?') && onRemove()}>Remove</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button>
      </>}>
      {initial.source_url && !initial.id && (
        <p className="field-hint from-post">From a saved post · <a href={safeHttpUrl(initial.source_url) ?? undefined} target="_blank" rel="noreferrer">open it</a> to check the details, then paste the Google Maps link below</p>
      )}
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!f.name} placeholder="e.g. La Brisa" /></Field>
      <Field label="Category" group>
        <div className="kind-picker">
          {CATS.map((c) => (
            <button key={c} type="button" className={f.category === c ? 'on' : ''} onClick={() => setF({ ...f, category: c })}>
              <span>{CATEGORY_META[c].emoji}</span>{CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Area or address (optional)"><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="e.g. Canggu" /></Field>
      <Field label="Google Maps link (optional)"><input value={f.maps_url} onChange={(e) => setF({ ...f, maps_url: e.target.value })} inputMode="url" /></Field>
      {initial.lat != null && <p className="field-hint">Pin found: {initial.lat?.toFixed(5)}, {initial.lng?.toFixed(5)}</p>}
      <Field label="Notes (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}
