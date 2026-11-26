import { useState } from 'react';
import { extractUrl, isGoogleMapsUrl, parseMapsUrl, resolveShortLink } from '../lib/maps';
import { CATEGORY_META, type Place, type PlaceCategory } from '../lib/types';
import { Empty, Field, Sheet, useTrip } from '../ui';
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
                  {!offline && <button className="link-btn" onClick={() => addToItinerary(p)}>+ Itinerary</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && <PlaceForm initial={form} onClose={() => setForm(null)} onSaved={() => setForm(null)}
        onRemove={form.id ? () => act(() => backend.remove('places', form.id!), 'Place removed').then((ok) => ok && setForm(null)) : undefined} />}
    </div>
  );
}

function PlaceForm({ initial, onClose, onSaved, onRemove }: { initial: Partial<Place>; onClose: () => void; onSaved: () => void; onRemove?: () => void }) {
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
    };
    if (await act(() => backend.save('places', row), initial.id ? 'Saved' : 'Place saved')) onSaved();
  };
  return (
    <Sheet title={initial.id ? 'Edit place' : 'Save place'} onClose={onClose}
      footer={<>
        {onRemove && <button className="btn btn-danger-ghost" onClick={() => confirm('Remove this place?') && onRemove()}>Remove</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={save}>Save</button>
      </>}>
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
      {initial.lat != null && <p className="field-hint">📍 Pin found: {initial.lat?.toFixed(5)}, {initial.lng?.toFixed(5)}</p>}
      <Field label="Notes (optional)"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}
