import { useState } from 'react';
import { newInviteCode, uuid } from '../lib/backend';
import { fmtDay } from '../lib/dates';
import type { Traveller } from '../lib/types';
import { copyText, Field, inviteUrl, Sheet, shareUrl, useTrip } from '../ui';

export function ShareSheet({ onClose }: { onClose: () => void }) {
  const { data, isOwner, act, backend, toast } = useTrip();
  const { trip } = data;
  const link = shareUrl(trip.share_token);
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: trip.name, text: `Our ${trip.destination ?? ''} plans`, url: link });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    if (await copyText(link)) toast('Link copied');
  };
  return (
    <Sheet title="Share with friends" onClose={onClose}>
      <p>Anyone with this link can see dates, accommodation, the itinerary, times and statuses. It updates live.</p>
      <p className="muted small">Never shown: expenses, payments, private notes, booking references or anyone’s personal details.</p>
      {trip.share_enabled ? (
        <>
          <div className="link-box"><code>{link}</code></div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={share}>Share link</button>
            <a className="btn" href={link} target="_blank" rel="noreferrer">Preview</a>
          </div>
        </>
      ) : <p className="warn">Sharing is switched off.</p>}
      {isOwner && (
        <div className="btn-row">
          <button className="btn" onClick={() => act(() => backend.updateTrip(trip.id, { share_enabled: !trip.share_enabled }), trip.share_enabled ? 'Sharing off' : 'Sharing on')}>
            {trip.share_enabled ? 'Turn sharing off' : 'Turn sharing on'}
          </button>
          <button className="btn" onClick={() => confirm('Make a new link? The old one will stop working.') && act(() => backend.updateTrip(trip.id, { share_token: uuid() }), 'New link created')}>
            New link
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function SettingsSheet({ onClose, onSwitchTrip, onSignOut }: { onClose: () => void; onSwitchTrip: () => void; onSignOut: () => void }) {
  const { data, isOwner, act, backend, me, toast, offline } = useTrip();
  const { trip, members, travellers, expenses } = data;
  const [t, setT] = useState({ name: trip.name, destination: trip.destination ?? '', start_date: trip.start_date ?? '', end_date: trip.end_date ?? '' });
  const [newTraveller, setNewTraveller] = useState('');
  const dirty = t.name !== trip.name || t.destination !== (trip.destination ?? '') || t.start_date !== (trip.start_date ?? '') || t.end_date !== (trip.end_date ?? '');
  const cloud = backend.mode === 'cloud';

  const removeTraveller = (id: string, name: string) => {
    if (expenses.some((e) => e.paid_by === id || e.shares.some((s) => s.traveller_id === id))) {
      toast(`${name} is in some expenses. Edit those first.`);
      return;
    }
    if (confirm(`Remove ${name} from travellers?`)) void act(() => backend.remove('travellers', id));
  };

  return (
    <Sheet title="Trip settings" onClose={onClose}>
      <section className="settings-sec">
        <h3>Trip</h3>
        <Field label="Name"><input value={t.name} disabled={!isOwner} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
        <Field label="Destination"><input value={t.destination} disabled={!isOwner} onChange={(e) => setT({ ...t, destination: e.target.value })} /></Field>
        <div className="row2">
          <Field label="Start"><input type="date" value={t.start_date} disabled={!isOwner} onChange={(e) => setT({ ...t, start_date: e.target.value })} /></Field>
          <Field label="End"><input type="date" value={t.end_date} min={t.start_date} disabled={!isOwner} onChange={(e) => setT({ ...t, end_date: e.target.value })} /></Field>
        </div>
        {isOwner && dirty && (
          <button className="btn btn-primary" disabled={!t.name.trim()} onClick={() => act(() => backend.updateTrip(trip.id, {
            name: t.name.trim(), destination: t.destination || null, start_date: t.start_date || null, end_date: t.end_date || null,
          }), 'Trip updated')}>Save trip details</button>
        )}
        {!isOwner && <p className="muted small">Only the trip owner can change these.</p>}
      </section>

      {cloud && (
        <section className="settings-sec">
          <h3>Travelling members</h3>
          <p className="muted small">Members can edit plans, places and expenses.</p>
          <ul className="member-list">
            {members.map((m) => (
              <li key={m.user_id}>
                <span>{m.display_name}{m.user_id === me.id && ' (you)'}</span>
                <span className="role">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                {isOwner && m.user_id !== me.id && !offline && (
                  <span className="btn-row tight">
                    <button className="btn btn-sm" onClick={() => act(() => backend.updateMember(m, { role: m.role === 'owner' ? 'member' : 'owner' }))}>
                      {m.role === 'owner' ? 'Make member' : 'Make owner'}
                    </button>
                    <button className="btn btn-sm btn-danger-ghost" onClick={() => confirm(`Remove ${m.display_name} from the trip?`) && act(() => backend.removeMember(m))}>Remove</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Field label="Invite your travel mates" hint="They sign up, then open this link to join as members.">
            <div className="paste-row">
              <input readOnly value={inviteUrl(trip.invite_code)} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={async () => (await copyText(inviteUrl(trip.invite_code))) && toast('Invite link copied')}>Copy</button>
            </div>
          </Field>
          <p className="muted small">Invite code: <code>{trip.invite_code}</code></p>
          {isOwner && !offline && (
            <button className="btn btn-sm" onClick={() => confirm('Make a new invite code? The old invite link will stop working. People already in the trip stay in.') &&
              act(() => backend.updateTrip(trip.id, { invite_code: newInviteCode() }), 'New invite code created')}>New invite code</button>
          )}
          <p className="muted small">Tip: once everyone has joined, make a new invite code so the old link can’t be reused.</p>
        </section>
      )}

      <section className="settings-sec">
        <h3>Travellers</h3>
        <p className="muted small">Everyone who shares costs, with their own dates if they arrive late or leave early. When a mate joins, their account links to the name with the same first name.
          {isOwner && cloud && ' If a name didn’t link, pick their account next to it. Any duplicate entry is merged in.'}</p>
        <ul className="member-list">
          {travellers.map((tr) => (
            <li key={tr.id}>
              <input className="inline-input" defaultValue={tr.name} disabled={offline}
                onBlur={(e) => e.target.value.trim() && e.target.value !== tr.name && act(() => backend.save('travellers', { ...tr, name: e.target.value.trim() }), 'Renamed')} />
              <TravellerDates tr={tr} />
              {tr.user_id && <span className="role">✓ account</span>}
              {!tr.user_id && isOwner && cloud && !offline && members.length > 0 && (
                <select className="link-select" value="" aria-label={`Link ${tr.name} to an account`}
                  onChange={(e) => {
                    const m = members.find((x) => x.user_id === e.target.value);
                    if (m && confirm(`Link “${tr.name}” to ${m.display_name}’s account? Their plans, visibility and expenses will follow this name.`)) {
                      void act(() => backend.linkTraveller(tr.id, m.user_id), 'Linked');
                    }
                  }}>
                  <option value="">Link account…</option>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}
                </select>
              )}
              {!tr.user_id && !offline && <button className="btn btn-sm btn-danger-ghost" onClick={() => removeTraveller(tr.id, tr.name)}>Remove</button>}
            </li>
          ))}
        </ul>
        {!offline && (
          <form className="paste-row" onSubmit={(e) => {
            e.preventDefault();
            if (!newTraveller.trim()) return;
            void act(() => backend.save('travellers', { trip_id: trip.id, name: newTraveller.trim(), user_id: null }), 'Traveller added');
            setNewTraveller('');
          }}>
            <input value={newTraveller} onChange={(e) => setNewTraveller(e.target.value)} placeholder="Name" />
            <button className="btn">Add</button>
          </form>
        )}
      </section>

      <section className="settings-sec">
        <h3>Account</h3>
        <p className="muted small">{cloud ? `Signed in as ${me.email}` : 'Demo mode: data is saved only in this browser.'}</p>
        <div className="btn-row">
          <button className="btn" onClick={onSwitchTrip}>Switch trip</button>
          {cloud && <button className="btn" onClick={onSignOut}>Sign out</button>}
          {isOwner && (
            <button className="btn btn-danger-ghost" onClick={() => confirm(`Delete “${trip.name}” and everything in it? This can’t be undone.`) &&
              act(() => backend.deleteTrip(trip.id), 'Trip deleted').then((ok) => ok && onSwitchTrip())}>Delete trip</button>
          )}
        </div>
      </section>
    </Sheet>
  );
}

/** Arrival and departure for one traveller; empty means the trip's own dates. */
function TravellerDates({ tr }: { tr: Traveller }) {
  const { data, act, backend, offline } = useTrip();
  const { trip } = data;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(tr.arrive_on ?? '');
  const [to, setTo] = useState(tr.leave_on ?? '');
  const short = (d: string | null | undefined) => (d ? fmtDay(d, { day: 'numeric', month: 'short' }) : '');
  const label = tr.arrive_on || tr.leave_on
    ? `${short(tr.arrive_on || trip.start_date)} – ${short(tr.leave_on || trip.end_date)}`
    : 'Whole trip';
  const save = async (a: string, b: string) => {
    if (await act(() => backend.save('travellers', { ...tr, arrive_on: a || null, leave_on: b || null }), 'Dates saved')) setOpen(false);
  };
  if (offline) return <span className="role">{label}</span>;
  return (
    <>
      <button type="button" className="date-chip" onClick={() => setOpen(!open)} aria-expanded={open}>{label}</button>
      {open && (
        <div className="dates-edit">
          <label className="field"><span className="field-label">Arrives</span>
            <input type="date" value={from} min={trip.start_date ?? undefined} max={trip.end_date ?? undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span className="field-label">Leaves</span>
            <input type="date" value={to} min={from || trip.start_date || undefined} max={trip.end_date ?? undefined} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="btn-row tight">
            <button type="button" className="btn btn-sm btn-primary" disabled={!!from && !!to && to < from} onClick={() => save(from, to)}>Save</button>
            {(tr.arrive_on || tr.leave_on) && <button type="button" className="btn btn-sm" onClick={() => { setFrom(''); setTo(''); void save('', ''); }}>Whole trip</button>}
          </div>
        </div>
      )}
    </>
  );
}
