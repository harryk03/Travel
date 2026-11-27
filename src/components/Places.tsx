import { useEffect, useRef, useState } from 'react';
import { decodeEntities } from '../../api/_inbox-extract.js';
import { fmtDay } from '../lib/dates';
import { fmtPhone, shrinkImage, validPhone, waDigits } from '../lib/images';
import { extractUrl, isGoogleMapsUrl, parseMapsUrl, resolveShortLink, safeHttpUrl } from '../lib/maps';
import { CATEGORY_META, type InboxFile, type InboxItem, type Place, type PlaceCategory } from '../lib/types';
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
      category: guessCategory(`${name} ${x.note ?? ''} ${x.caption ?? ''} ${x.details ?? ''}`),
      address: x.address ?? null, phone: x.phone ?? null, maps_url: x.maps_url ?? null,
      lat: parsed?.lat ?? null, lng: parsed?.lng ?? null,
      notes: x.name && x.note && x.note !== x.name ? x.note : null,
      source_url: isMapShare ? null : x.url,
    });
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
                {p.helper_added && <div className="helper-meta">Added by Claude</div>}
                <div className="item-foot" onClick={(e) => e.stopPropagation()}>
                  <MapLinks p={p} />
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

      {detailsFor && <DetailsSheet x={detailsFor} onClose={() => setDetailsFor(null)} />}
      {form && <PlaceForm initial={form} inboxId={fromInbox} onClose={() => { setForm(null); setFromInbox(null); }} onSaved={() => { setForm(null); setFromInbox(null); }}
        onRemove={form.id ? () => act(() => backend.remove('places', form.id!), 'Place removed').then((ok) => ok && setForm(null)) : undefined} />}
    </div>
  );
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
  const { data, act, backend } = useTrip();
  const [f, setF] = useState({
    name: initial.name ?? '', category: initial.category ?? ('other' as PlaceCategory), address: initial.address ?? '',
    maps_url: initial.maps_url ?? '', notes: initial.notes ?? '', phone: initial.phone ? fmtPhone(initial.phone) : '',
  });
  const phoneOk = !f.phone.trim() || validPhone(f.phone);
  // The phone column arrives with migration 008 (inboxFiles is only loaded once it exists).
  const hasPhone = data.inboxFiles !== undefined || Boolean(initial.phone);
  const save = async () => {
    const parsed = f.maps_url && f.maps_url !== initial.maps_url ? parseMapsUrl(f.maps_url) : null;
    const row = {
      ...(initial.id ? { id: initial.id } : {}), trip_id: data.trip.id, name: f.name.trim(), category: f.category,
      address: f.address.trim() || null, maps_url: f.maps_url.trim() || null, notes: f.notes.trim() || null,
      lat: parsed ? parsed.lat : initial.lat ?? null, lng: parsed ? parsed.lng : initial.lng ?? null,
      // Only sent when used, so saving still works before migration 007 has run.
      ...(initial.source_url ? { source_url: safeHttpUrl(initial.source_url) } : {}),
      // Same for phone (migration 008): only sent when there is one, or to clear one.
      ...(f.phone.trim() || initial.phone ? { phone: f.phone.trim() || null } : {}),
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
        <button className="btn btn-primary" disabled={!f.name.trim() || !phoneOk} onClick={save}>Save</button>
      </>}>
      {inboxId && (initial.source_url ? (
        <p className="field-hint from-post">From a saved post · <a href={safeHttpUrl(initial.source_url) ?? undefined} target="_blank" rel="noreferrer">open it</a> to check the details{initial.maps_url ? '' : ', then paste the Google Maps link below'}</p>
      ) : (
        <p className="field-hint from-post">From your inbox · check the details, then save</p>
      ))}
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
      {hasPhone && (
        <Field label="Phone or WhatsApp (optional)" hint={phoneOk ? undefined : 'Numbers only, e.g. +62 821 3573 2415'}>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="+62 …" />
        </Field>
      )}
      <Field label="Notes (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}
