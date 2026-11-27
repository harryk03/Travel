import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { decodeEntities } from '../../api/_inbox-extract.js';
import { fmtDay, fmtRange } from '../lib/dates';
import { fmtPhone, shrinkImage, validPhone, waDigits } from '../lib/images';
import { extractUrl, isGoogleMapsUrl, parseMapsUrl, resolveShortLink, safeHttpUrl } from '../lib/maps';
import { CATEGORY_META, placeGroup, placeMeta, type InboxFile, type InboxItem, type Item, type Place, type PlaceCategory } from '../lib/types';
import { Empty, Field, Icon, Segmented, Sheet, useTrip } from '../ui';
import type { Pin } from './PlacesMap';
import { MapLinks } from './ItemCard';

// Built-in categories you can pick (custom ones come from your own places). Spa needs migration 010.
const CATS = (Object.keys(CATEGORY_META) as PlaceCategory[]).filter((c) => c !== 'custom');
const pickable = (extras: boolean) => CATS.filter((c) => extras || c !== 'spa');
const QUICK_EMOJI = ['🎾', '🧘', '🏄', '🛍️', '🍹', '🎵', '📸', '🛵', '🍦', '🌅'];
// Leaflet and the map styles only download when someone opens the map.
const PlacesMap = lazy(() => import('./PlacesMap'));
const VIEW_KEY = 'triphq-places-view';
const hasPin = (x: { lat: number | null; lng: number | null }) => x.lat != null && x.lng != null;
function savedView(): 'list' | 'map' {
  try { return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'list'; } catch { return 'list'; }
}

function guessCategory(name: string, extras = false): PlaceCategory {
  const n = name.toLowerCase();
  if (/gym|fitness|crossfit|yoga/.test(n)) return 'gym';
  if (extras && /\bspa\b|massage|sauna|reflexology|facial|wellness/.test(n)) return 'spa';
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
  const [filter, setFilter] = useState<string>('all');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [form, setForm] = useState<Partial<Place> | null>(null);
  const [fromInbox, setFromInbox] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [view, setViewState] = useState<'list' | 'map'>(savedView);
  const setView = (v: 'list' | 'map') => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* not saved */ } };
  const [selected, setSelected] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<Place | null>(null);
  const inbox = data.inbox;
  const fresh = inbox?.filter((x) => x.status === 'new') ?? [];
  const dismissed = inbox?.filter((x) => x.status === 'dismissed') ?? [];
  const [detailsFor, setDetailsFor] = useState<InboxItem | null>(null);
  // Screenshots and details need migration 008; until it has run these stay hidden.
  const hasDetails = data.inboxFiles !== undefined;
  const fileCount = (id: string) => data.inboxFiles?.filter((f) => f.inbox_id === id).length ?? 0;
  const addFromInbox = async (x: InboxItem) => {
    const name = x.name ?? x.note ?? '';
    const isMapShare = Boolean(x.maps_url && x.maps_url === x.url);
    let parsed = x.maps_url ? parseMapsUrl(x.maps_url) : null;
    if (parsed?.isShortLink && backend.mode === 'cloud') {
      const full = await resolveShortLink(x.maps_url!);
      if (full) parsed = { ...(parseMapsUrl(full) ?? parsed), url: x.maps_url!, isShortLink: false };
    }
    setFromInbox(x.id);
    setForm({
      name: name || parsed?.name || '',
      category: guessCategory(`${name} ${x.note ?? ''} ${x.caption ?? ''} ${x.details ?? ''}`, Boolean(data.placeExtras)),
      address: x.address ?? null, phone: x.phone ?? null, maps_url: x.maps_url ?? null,
      lat: parsed?.lat ?? null, lng: parsed?.lng ?? null,
      notes: x.name && x.note && x.note !== x.name ? x.note : null,
      source_url: isMapShare ? null : x.url,
    });
  };
  const setStatus = (x: InboxItem, status: InboxItem['status']) =>
    act(() => backend.updateInbox(x.id, { status }), status === 'dismissed' ? 'Dismissed' : 'Back in the inbox');

  // One chip per category in use: built-ins in their usual order, then your custom ones by name.
  const groups = useMemo(() => {
    const m = new Map<string, { emoji: string; label: string; count: number }>();
    for (const c of CATS) m.set(c, { ...CATEGORY_META[c], count: 0 });
    for (const p of data.places) {
      const key = placeGroup(p);
      const g = m.get(key) ?? { ...placeMeta(p), count: 0 };
      g.count += 1;
      m.set(key, g);
    }
    return [...m.entries()].filter(([, g]) => g.count > 0);
  }, [data.places]);
  const shown = data.places.filter((p) => filter === 'all' || placeGroup(p) === filter);

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
    setForm({ name, maps_url: url, lat: parsed?.lat ?? null, lng: parsed?.lng ?? null, category: guessCategory(name, Boolean(data.placeExtras)) });
    setPaste('');
  };

  const addToItinerary = (p: Place) =>
    editItem({
      title: p.name, kind: placeMeta(p).kind, location_name: p.name, address: p.address,
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
            {fresh.map((x) => <InboxRow key={x.id} x={x} offline={offline} files={fileCount(x.id)} onAdd={() => void addFromInbox(x)}
              onDetails={hasDetails ? () => setDetailsFor(x) : undefined} onDismiss={() => setStatus(x, 'dismissed')} />)}
            {showDismissed && dismissed.map((x) => <InboxRow key={x.id} x={x} offline={offline} files={fileCount(x.id)} onRestore={() => setStatus(x, 'new')} />)}
          </div>
        </section>
      )}
      {inbox && dismissed.length > 0 && (
        <button className="link-btn inbox-toggle" onClick={() => setShowDismissed(!showDismissed)}>
          {showDismissed ? 'Hide dismissed' : `Show dismissed (${dismissed.length})`}
        </button>
      )}

      <div className="view-row">
        <Segmented value={view} onChange={(v) => { setView(v); setSelected(null); }}
          options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />
      </div>

      <div className="chips" role="tablist">
        <button className={filter === 'all' ? 'chip on' : 'chip'} onClick={() => setFilter('all')}>All {data.places.length}</button>
        {groups.map(([key, g]) => (
          <button key={key} className={filter === key ? 'chip on' : 'chip'} onClick={() => setFilter(key)}>
            {g.emoji} {g.label} {g.count}
          </button>
        ))}
      </div>

      {view === 'map' ? (
        <MapView places={shown} stays={filter === 'all' || filter === 'stay' ? data.items.filter((i) => i.kind === 'stay' && hasPin(i)) : []}
          selected={selected} onSelect={setSelected} onEdit={offline ? undefined : setForm} onPin={offline ? undefined : setPinFor} />
      ) : shown.length === 0 ? (
        <Empty emoji="📍" title="No places saved yet">
          <p className="muted small">In Google Maps tap Share → Copy link, then paste it above.</p>
        </Empty>
      ) : (
        <div className="place-grid">
          {shown.map((p) => (
            <div key={p.id} className="card place-card" onClick={offline ? undefined : () => setForm(p)} role="button" tabIndex={0}>
              <div className="place-emoji">{placeMeta(p).emoji}</div>
              <div className="place-main">
                <div className="item-title">{p.name}</div>
                {p.address && <div className="item-sub">{p.address}</div>}
                {p.notes && <div className="item-notes">{p.notes}</div>}
                {p.helper_added && <div className="helper-meta">Added by Claude</div>}
                <div className="item-foot" onClick={(e) => e.stopPropagation()}>
                  <MapLinks p={p} />
                  <SiteLink url={p.website} />
                  <PhoneLinks phone={p.phone} />
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

      {pinFor && <PinSheet place={pinFor} onClose={() => setPinFor(null)} />}
      {detailsFor && <DetailsSheet x={detailsFor} onClose={() => setDetailsFor(null)} />}
      {form && <PlaceForm initial={form} inboxId={fromInbox} onClose={() => { setForm(null); setFromInbox(null); }} onSaved={() => { setForm(null); setFromInbox(null); }}
        onRemove={form.id ? () => act(() => backend.remove('places', form.id!), 'Place removed').then((ok) => ok && setForm(null)) : undefined} />}
    </div>
  );
}

function MapView({ places, stays, selected, onSelect, onEdit, onPin }: {
  places: Place[]; stays: Item[]; selected: string | null; onSelect: (id: string | null) => void;
  onEdit?: (p: Place) => void; onPin?: (p: Place) => void;
}) {
  const { toast } = useTrip();
  const pins = useMemo<Pin[]>(() => [
    ...places.filter(hasPin).map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, emoji: placeMeta(p).emoji, label: p.name })),
    ...stays.map((i) => ({ id: `stay:${i.id}`, lat: i.lat!, lng: i.lng!, emoji: CATEGORY_META.stay.emoji, label: i.title })),
  ], [places, stays]);
  const unpinned = places.filter((p) => !hasPin(p));
  const place = places.find((p) => p.id === selected);
  const stay = stays.find((i) => `stay:${i.id}` === selected);
  return (
    <>
      <Suspense fallback={<div className="map-wrap"><div className="map map-loading">Loading map…</div></div>}>
        <PlacesMap pins={pins} selected={selected} onSelect={onSelect} onLocateError={toast} />
      </Suspense>
      {place && (
        <div className="card map-card">
          <div className="place-emoji">{placeMeta(place).emoji}</div>
          <div className="place-main">
            <div className="item-title">{place.name}</div>
            {place.address && <div className="item-sub">{place.address}</div>}
            {place.notes && <div className="item-notes map-card-notes">{place.notes}</div>}
            <div className="item-foot">
              <MapLinks p={place} />
              <SiteLink url={place.website} />
              <PhoneLinks phone={place.phone} />
              {safeHttpUrl(place.source_url) && (
                <a className="post-link" href={safeHttpUrl(place.source_url)!} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Post</a>
              )}
              {onEdit && <button className="link-btn" onClick={() => onEdit(place)}>Details</button>}
            </div>
          </div>
        </div>
      )}
      {stay && (
        <div className="card map-card">
          <div className="place-emoji">{CATEGORY_META.stay.emoji}</div>
          <div className="place-main">
            <div className="item-title">{stay.title}</div>
            <div className="item-sub">{fmtRange(stay.day, stay.end_day)}{stay.location_name && stay.location_name !== stay.title ? ` · ${stay.location_name}` : ''}</div>
            <div className="item-foot"><MapLinks p={stay} /></div>
          </div>
        </div>
      )}
      {unpinned.length > 0 && (
        <section className="unpinned" aria-label="Not on the map yet">
          <div className="section-head">
            <h2 className="section-title">Not on the map yet</h2>
            <span className="section-meta">{unpinned.length}</span>
          </div>
          <p className="muted small unpinned-why">Their Map button searches Google Maps by name, but this map needs an exact pin. Add one from the place’s Google Maps link.</p>
          <div className="unpinned-list">
            {unpinned.map((p) => (
              <div key={p.id} className="unpinned-row">
                <span className="unpinned-emoji">{placeMeta(p).emoji}</span>
                <span className="unpinned-name">{p.name}</span>
                {onPin && <button className="btn btn-sm" onClick={() => onPin(p)}>Add pin</button>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Pin a place from a Google Maps link: open the search, copy the place's link, paste it here. */
function PinSheet({ place, onClose }: { place: Place; onClose: () => void }) {
  const { act, backend } = useTrip();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const search = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(', '))}`;
  const save = async () => {
    const url = extractUrl(link);
    if (!url) return setHint('Paste the link you copied from Google Maps.');
    setBusy(true);
    setHint('');
    let parsed = parseMapsUrl(url);
    if (parsed?.isShortLink && backend.mode === 'cloud') {
      const full = await resolveShortLink(url);
      if (full) parsed = { ...(parseMapsUrl(full) ?? parsed), url, isShortLink: false };
    }
    setBusy(false);
    if (parsed?.lat == null || parsed.lng == null) return setHint('Couldn’t read a pin from that link. In Google Maps, open the place itself (not the search list), then Share → Copy link.');
    if (await act(() => backend.save('places', { ...place, maps_url: url, lat: parsed!.lat, lng: parsed!.lng }), 'Pin added')) onClose();
  };
  return (
    <Sheet title="Add a pin" onClose={onClose}
      footer={<><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!link.trim() || busy} onClick={save}>{busy ? '…' : 'Save pin'}</button></>}>
      <p className="details-for">{place.name}</p>
      <ol className="pin-steps">
        <li><a href={search} target="_blank" rel="noreferrer">Find it in Google Maps <Icon name="external" size={14} /></a> and open the right place</li>
        <li>Tap Share, then Copy link</li>
        <li>Come back and paste it here</li>
      </ol>
      <Field label="Google Maps link"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" inputMode="url" /></Field>
      {hint && <p className="field-hint">{hint}</p>}
    </Sheet>
  );
}

/** The place's own website, shown as its domain. */
function SiteLink({ url }: { url?: string | null }) {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  return (
    <span className="map-links" onClick={(e) => e.stopPropagation()}>
      <a href={safe} target="_blank" rel="noreferrer"><Icon name="link" size={16} />Website</a>
    </span>
  );
}

/** "bendbali.com" → "https://bendbali.com/". Null if it can't be a web address. */
function normalizeWebsite(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  const safe = safeHttpUrl(withScheme);
  try {
    return safe && new URL(safe).hostname.includes('.') ? safe : null;
  } catch {
    return null;
  }
}

/** The database allows 1–16 characters; anything from the emoji keyboard fits. No stricter check, so iPad
 *  and Android emoji (skin tones, flags, joined emoji) are never refused. */
function validEmoji(e: string): boolean {
  const t = e.trim();
  return t.length >= 1 && t.length <= 16;
}

function PhoneLinks({ phone }: { phone?: string | null }) {
  if (!phone) return null;
  const wa = waDigits(phone);
  const tel = phone.replace(/[^\d+]/g, '');
  return (
    <span className="map-links" onClick={(e) => e.stopPropagation()}>
      {tel && <a href={`tel:${tel}`}><Icon name="phone" size={16} />Call</a>}
      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><Icon name="message" size={16} />WhatsApp</a>}
    </span>
  );
}

function InboxRow({ x: raw, offline, files, onAdd, onDetails, onDismiss, onRestore }: {
  x: InboxItem; offline: boolean; files: number; onAdd?: () => void; onDetails?: () => void; onDismiss?: () => void; onRestore?: () => void;
}) {
  // Items saved before the endpoint decoded captions still hold codes like &#x1f62e;.
  const x = { ...raw, caption: raw.caption ? decodeEntities(raw.caption) : raw.caption };
  const url = safeHttpUrl(x.url);
  const short = url ? url.replace(/^https?:\/\/(www\.)?/, '') : x.url;
  const title = x.name || x.note || x.caption || short;
  const sub = x.caption && title !== x.caption ? x.caption : x.name && x.note && x.note !== x.name ? x.note : null;
  const found = [x.address, x.phone && fmtPhone(x.phone)].filter(Boolean).join(' · ');
  const yours = [x.details, files > 0 && `${files} screenshot${files === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const site = x.source === 'instagram' ? 'Instagram' : x.source === 'tiktok' ? 'TikTok' : x.maps_url === x.url ? 'Maps' : short.split('/')[0];
  return (
    <div className={`inbox-row ${x.status}`}>
      <span className="inbox-icon"><Icon name={x.source !== 'other' ? x.source : x.maps_url === x.url ? 'places' : 'link'} size={16} /></span>
      <div className="inbox-main">
        <p className="inbox-title">{title}</p>
        {sub && <p className="inbox-caption">{sub}</p>}
        {found && <p className="inbox-found">{found}</p>}
        {x.status === 'new' && x.needs && <p className="inbox-needs">Needs: {x.needs}</p>}
        {yours && <p className="inbox-yours">You added: {yours}</p>}
        <p className="inbox-meta">{site} · {fmtDay(x.created_at.slice(0, 10))}{x.status === 'dismissed' ? ' · dismissed' : ''}</p>
        <div className="inbox-actions">
          {url && <a href={url} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Open</a>}
          {!offline && onAdd && <button className="btn btn-sm" onClick={onAdd}>Add as place</button>}
          {!offline && onDetails && <button className="link-btn" onClick={onDetails}>Add details</button>}
          {!offline && onDismiss && <button className="link-btn" onClick={onDismiss}>Dismiss</button>}
          {!offline && onRestore && <button className="link-btn" onClick={onRestore}>Restore</button>}
        </div>
      </div>
    </div>
  );
}

/** What you found for an inbox item: free text plus up to 6 screenshots, for Claude (or you) to finish the place. */
function DetailsSheet({ x, onClose }: { x: InboxItem; onClose: () => void }) {
  const { data, act, backend, toast } = useTrip();
  const [text, setText] = useState(x.details ?? '');
  const [files, setFiles] = useState<InboxFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const reload = () => backend.listInboxFiles(x.id).then(setFiles).catch(() => setFiles([]));
  useEffect(() => { void reload(); }, [x.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = 6 - (files?.length ?? 0);
    const picked = [...list].slice(0, Math.max(0, room));
    if (list.length > room) toast(room > 0 ? `Only ${room} more screenshot${room === 1 ? '' : 's'} fit (6 per item)` : 'This item already has 6 screenshots');
    setBusy(true);
    for (const file of picked) {
      try {
        const img = await shrinkImage(file);
        await backend.addInboxFile({ trip_id: data.trip.id, inbox_id: x.id, ...img });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not add that screenshot');
      }
    }
    if (picker.current) picker.current.value = '';
    await reload();
    setBusy(false);
  };
  const remove = async (f: InboxFile) => {
    if (await act(() => backend.removeInboxFile(f.id), 'Screenshot removed')) await reload();
  };
  const save = async () => {
    if (await act(() => backend.updateInbox(x.id, { details: text.trim() || null }), 'Details saved')) onClose();
  };
  return (
    <Sheet title="Add details" onClose={onClose}
      footer={<><span className="spacer" /><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <p className="field-hint details-for">{x.name || x.note || x.caption || x.url}</p>
      {x.needs && <p className="inbox-needs">Needs: {x.needs}</p>}
      <Field label="What you found" hint="Name, address, opening hours, prices, a Google Maps link, anything useful">
        <textarea rows={4} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="e.g. It's called Sprout, on Jl. Raya Canggu, open 7am to 4pm" />
      </Field>
      <div className="field">
        <span className="field-label">Screenshots</span>
        <div className="shots">
          {files === null && <p className="muted small">Loading…</p>}
          {files?.map((f) => (
            <figure key={f.id} className="shot">
              <img src={`data:${f.mime};base64,${f.data}`} alt="Screenshot" />
              <button type="button" className="shot-remove" aria-label="Remove screenshot" onClick={() => void remove(f)}><Icon name="x" size={14} /></button>
            </figure>
          ))}
          {files !== null && files.length < 6 && (
            <button type="button" className="shot-add" disabled={busy} onClick={() => picker.current?.click()}>
              <Icon name="image" size={20} />{busy ? 'Adding…' : 'Add'}
            </button>
          )}
        </div>
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
        <span className="field-hint">Up to 6. They're shrunk on your phone first and only trip members can see them.</span>
      </div>
    </Sheet>
  );
}

function PlaceForm({ initial, inboxId, onClose, onSaved, onRemove }: { initial: Partial<Place>; inboxId?: string | null; onClose: () => void; onSaved: () => void; onRemove?: () => void }) {
  const { data, act, backend, toast } = useTrip();
  const [tried, setTried] = useState(false);
  const [f, setF] = useState({
    name: initial.name ?? '', category: initial.category ?? ('other' as PlaceCategory), address: initial.address ?? '',
    maps_url: initial.maps_url ?? '', notes: initial.notes ?? '', phone: initial.phone ? fmtPhone(initial.phone) : '',
    website: initial.website ?? '', custom_emoji: initial.custom_emoji ?? '', custom_label: initial.custom_label ?? '',
  });
  const phoneOk = !f.phone.trim() || validPhone(f.phone);
  // Websites, Spa and custom categories need migration 010; hidden until it has run.
  const extras = Boolean(data.placeExtras);
  const website = normalizeWebsite(f.website);
  const websiteOk = !f.website.trim() || Boolean(website);
  const isCustom = f.category === 'custom';
  // Save stays tappable; if something needs fixing it says what, instead of a grey button with no reason.
  const problems = [
    !f.name.trim() && 'Add a name',
    !phoneOk && 'Check the phone number: digits only, e.g. +62 821 3573 2415',
    !websiteOk && 'Check the website, e.g. bendbali.com',
    isCustom && !validEmoji(f.custom_emoji) && 'Pick an emoji for the category',
    isCustom && !f.custom_label.trim() && 'Give the category a name',
  ].filter(Boolean) as string[];
  // Custom categories already used in this trip, so they can be picked again with one tap.
  const customs = useMemo(() => {
    const seen = new Map<string, { emoji: string; label: string }>();
    for (const p of data.places) if (p.category === 'custom' && p.custom_emoji && p.custom_label) seen.set(p.custom_label.trim().toLowerCase(), { emoji: p.custom_emoji, label: p.custom_label.trim() });
    return [...seen.values()];
  }, [data.places]);
  // The phone column arrives with migration 008 (inboxFiles is only loaded once it exists).
  const hasPhone = data.inboxFiles !== undefined || Boolean(initial.phone);
  const save = async () => {
    if (problems.length) {
      setTried(true);
      toast(problems[0]);
      return;
    }
    let parsed = f.maps_url && f.maps_url !== initial.maps_url ? parseMapsUrl(f.maps_url) : null;
    if (parsed?.isShortLink && backend.mode === 'cloud') {
      const full = await resolveShortLink(f.maps_url.trim());
      if (full) parsed = { ...(parseMapsUrl(full) ?? parsed), isShortLink: false };
    }
    const row = {
      ...(initial.id ? { id: initial.id } : {}), trip_id: data.trip.id, name: f.name.trim(), category: f.category,
      address: f.address.trim() || null, maps_url: f.maps_url.trim() || null, notes: f.notes.trim() || null,
      lat: parsed ? parsed.lat : initial.lat ?? null, lng: parsed ? parsed.lng : initial.lng ?? null,
      // Only sent when used, so saving still works before migration 007 has run.
      ...(initial.source_url ? { source_url: safeHttpUrl(initial.source_url) } : {}),
      // Same for phone (migration 008): only sent when there is one, or to clear one.
      ...(f.phone.trim() || initial.phone ? { phone: f.phone.trim() || null } : {}),
      // Same for the migration 010 fields.
      ...(website || initial.website ? { website } : {}),
      ...(isCustom || initial.custom_emoji ? { custom_emoji: isCustom ? f.custom_emoji.trim() : null, custom_label: isCustom ? f.custom_label.trim() : null } : {}),
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
        <button className="btn btn-primary" onClick={save}>Save</button>
      </>}>
      {inboxId && (initial.source_url ? (
        <p className="field-hint from-post">From a saved post · <a href={safeHttpUrl(initial.source_url) ?? undefined} target="_blank" rel="noreferrer">open it</a> to check the details{initial.maps_url ? '' : ', then paste the Google Maps link below'}</p>
      ) : (
        <p className="field-hint from-post">From your inbox · check the details, then save</p>
      ))}
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus={!f.name} placeholder="e.g. La Brisa" /></Field>
      <Field label="Category" group>
        <div className="kind-picker">
          {pickable(extras).map((c) => (
            <button key={c} type="button" className={f.category === c ? 'on' : ''} onClick={() => setF({ ...f, category: c })}>
              <span>{CATEGORY_META[c].emoji}</span>{CATEGORY_META[c].label}
            </button>
          ))}
          {extras && customs.map((c) => (
            <button key={c.label} type="button" className={isCustom && f.custom_label.trim().toLowerCase() === c.label.toLowerCase() ? 'on' : ''}
              onClick={() => setF({ ...f, category: 'custom', custom_emoji: c.emoji, custom_label: c.label })}>
              <span>{c.emoji}</span>{c.label}
            </button>
          ))}
          {extras && (
            <button type="button" className={isCustom && !customs.some((c) => c.label.toLowerCase() === f.custom_label.trim().toLowerCase()) ? 'on' : ''}
              onClick={() => setF({ ...f, category: 'custom', custom_emoji: '', custom_label: '' })}>
              <span>＋</span>Custom
            </button>
          )}
        </div>
      </Field>
      {isCustom && (
        <div className="custom-cat">
          <Field label="Emoji" hint={tried && !validEmoji(f.custom_emoji) ? 'Pick an emoji' : undefined}>
            <input className="emoji-input" value={f.custom_emoji} maxLength={16} onChange={(e) => setF({ ...f, custom_emoji: e.target.value.trim() })} placeholder="🎾" aria-describedby="quick-emoji" />
          </Field>
          <Field label="Category name"><input value={f.custom_label} maxLength={40} onChange={(e) => setF({ ...f, custom_label: e.target.value })} placeholder="e.g. Padel" /></Field>
          <div className="quick-emoji" id="quick-emoji" role="group" aria-label="Quick emoji">
            {QUICK_EMOJI.map((e) => (
              <button key={e} type="button" className={f.custom_emoji === e ? 'on' : ''} onClick={() => setF({ ...f, custom_emoji: e })} aria-label={`Use ${e}`}>{e}</button>
            ))}
          </div>
        </div>
      )}
      <Field label="Area or address (optional)"><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="e.g. Canggu" /></Field>
      <Field label="Google Maps link (optional)"><input value={f.maps_url} onChange={(e) => setF({ ...f, maps_url: e.target.value })} inputMode="url" /></Field>
      {initial.lat != null && <p className="field-hint">Pin found: {initial.lat?.toFixed(5)}, {initial.lng?.toFixed(5)}</p>}
      {hasPhone && (
        <Field label="Phone or WhatsApp (optional)" hint={phoneOk ? undefined : 'Numbers only, e.g. +62 821 3573 2415'}>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="+62 …" />
        </Field>
      )}
      {(extras || initial.website) && (
        <Field label="Website (optional)" hint={websiteOk ? undefined : 'A web address, e.g. bendbali.com'}>
          <input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} inputMode="url" placeholder="e.g. bendbali.com" autoCapitalize="off" autoCorrect="off" />
        </Field>
      )}
      <Field label="Notes (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {tried && problems.length > 0 && (
        <div className="form-problems" role="alert">
          <p>Before saving:</p>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
    </Sheet>
  );
}
