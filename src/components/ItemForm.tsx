import { useState } from 'react';
import { newPosition } from '../lib/itinerary';
import { parseMapsUrl } from '../lib/maps';
import { KIND_META, type Item, type ItemKind } from '../lib/types';
import { Field, Icon, Segmented, Sheet, useTrip } from '../ui';

const KINDS = Object.keys(KIND_META) as ItemKind[];
const s = (v: string | null | undefined) => v ?? '';
const n = (v: string) => (v.trim() === '' ? null : v.trim());

export function ItemForm({ initial, onClose }: { initial: Partial<Item>; onClose: () => void }) {
  const { data, act, backend, me } = useTrip();
  const isNew = !initial.id;
  const [f, setF] = useState({
    kind: initial.kind ?? ('activity' as ItemKind),
    title: s(initial.title),
    day: initial.day ?? data.trip.start_date ?? '',
    end_day: s(initial.end_day),
    start_time: s(initial.start_time).slice(0, 5),
    end_time: s(initial.end_time).slice(0, 5),
    status: initial.status ?? 'tentative',
    location_name: s(initial.location_name),
    address: s(initial.address),
    maps_url: s(initial.maps_url),
    notes: s(initial.notes),
    private_notes: s(initial.private_notes),
    booking_ref: s(initial.booking_ref),
    visible_to: initial.visible_to ?? null as string[] | null,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.title.trim() || !f.day) return;
    const parsed = f.maps_url && f.maps_url !== initial.maps_url ? parseMapsUrl(f.maps_url) : null;
    const dayChanged = initial.day !== f.day;
    const position = isNew || dayChanged
      ? newPosition(data.items.filter((i) => i.day === f.day && i.id !== initial.id), n(f.start_time))
      : initial.position ?? 1;
    const row = {
      ...(initial.id ? { id: initial.id } : {}),
      trip_id: data.trip.id,
      kind: f.kind, title: f.title.trim(), day: f.day,
      end_day: f.kind === 'stay' ? n(f.end_day) : null,
      start_time: n(f.start_time), end_time: n(f.end_time), status: f.status,
      location_name: n(f.location_name) ?? parsed?.name ?? null, address: n(f.address), maps_url: n(f.maps_url),
      lat: parsed ? parsed.lat : initial.lat ?? null, lng: parsed ? parsed.lng : initial.lng ?? null,
      place_id: initial.place_id ?? null,
      notes: n(f.notes), private_notes: n(f.private_notes), booking_ref: n(f.booking_ref), position,
      // Only send when used, so saving still works on a database without the column yet.
      ...(f.visible_to || initial.visible_to ? { visible_to: f.visible_to && f.visible_to.length ? f.visible_to : null } : {}),
    };
    if (await act(() => backend.save('items', row), isNew ? 'Added to itinerary' : 'Saved')) onClose();
  };

  const remove = async () => {
    if (!initial.id || !confirm(`Delete “${initial.title}”?`)) return;
    if (await act(() => backend.remove('items', initial.id!), 'Deleted')) onClose();
  };

  return (
    <Sheet title={isNew ? 'Add plan' : 'Edit plan'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn btn-danger-ghost" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!f.title.trim() || !f.day || (!!f.visible_to && f.visible_to.length === 0)}>Save</button>
      </>}>
      <div className="kind-picker">
        {KINDS.map((k) => (
          <button key={k} type="button" className={f.kind === k ? 'on' : ''} onClick={() => setF({ ...f, kind: k })}>
            <Icon name={k} size={16} />{KIND_META[k].label}
          </button>
        ))}
      </div>
      <Field label="Title"><input value={f.title} onChange={set('title')} placeholder={f.kind === 'flight' ? 'e.g. QF43 SYD → DPS' : 'What’s the plan?'} autoFocus={isNew} /></Field>
      <Field label="Status" group>
        <Segmented value={f.status} onChange={(v) => setF({ ...f, status: v })}
          options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'tentative', label: 'Tentative' }]} />
      </Field>
      <div className="row2">
        <Field label={f.kind === 'stay' ? 'Check-in' : 'Day'}><input type="date" value={f.day} onChange={set('day')} /></Field>
        {f.kind === 'stay' && <Field label="Check-out"><input type="date" value={f.end_day} min={f.day} onChange={set('end_day')} /></Field>}
      </div>
      <div className="row2">
        <Field label="Start time (optional)"><input type="time" value={f.start_time} onChange={set('start_time')} /></Field>
        <Field label="End time (optional)"><input type="time" value={f.end_time} onChange={set('end_time')} /></Field>
      </div>
      <Field label="Location"><input value={f.location_name} onChange={set('location_name')} placeholder="Place name or area" /></Field>
      <Field label="Google Maps link (optional)"><input value={f.maps_url} onChange={set('maps_url')} placeholder="https://maps.app.goo.gl/…" inputMode="url" /></Field>
      <Field label="Notes" hint="Visible to friends on the share link."><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
      <Field label="Who can see this" group hint={f.visible_to ? 'Only these people’s accounts can see it. It’s also left off the share link.' : 'Everyone in the trip, and on the share link.'}>
        <Segmented value={f.visible_to ? 'some' : 'all'} onChange={(v) => setF({ ...f, visible_to: v === 'all' ? null : (f.visible_to ?? data.travellers.filter((t) => t.user_id === me.id).map((t) => t.id)) })}
          options={[{ value: 'all', label: 'Everyone' }, { value: 'some', label: 'Only some people' }]} />
      </Field>
      {f.visible_to && (
        <ul className="split-list">
          {data.travellers.map((t) => (
            <li key={t.id}>
              <label className="check">
                <input type="checkbox" checked={f.visible_to!.includes(t.id)}
                  onChange={() => setF({ ...f, visible_to: f.visible_to!.includes(t.id) ? f.visible_to!.filter((x) => x !== t.id) : [...f.visible_to!, t.id] })} />
                <span>{t.name}</span>
                <span className="muted small">{t.user_id ? '' : 'no account linked yet'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {f.visible_to && !data.travellers.some((t) => t.user_id === me.id && f.visible_to!.includes(t.id)) && (
        <p className="warn">You’re not ticked, so you won’t be able to see this after saving.</p>
      )}
      <fieldset className="private-box">
        <legend>Travelling group only</legend>
        <Field label="Booking reference"><input value={f.booking_ref} onChange={set('booking_ref')} /></Field>
        <Field label="Private notes" hint="Never shown on the share link."><textarea rows={2} value={f.private_notes} onChange={set('private_notes')} /></Field>
      </fieldset>
    </Sheet>
  );
}
