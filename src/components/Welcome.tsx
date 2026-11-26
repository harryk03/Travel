import { useState } from 'react';
import { backend } from '../lib/config';
import { seedExampleTrip } from '../lib/seed';
import type { Trip, User } from '../lib/types';
import { Field, Icon } from '../ui';

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'in') await backend.signIn(email.trim(), password);
      else if (mode === 'up') await backend.signUp(email.trim(), password, name.trim());
      else {
        await backend.sendPasswordReset(email.trim());
        setMsg('If there’s an account for that email, a reset link is on its way. Check spam too, then open the link on this device.');
      }
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="center-screen">
      <form className="card narrow auth" onSubmit={submit}>
        <div className="logo"><span className="mark"><Icon name="directions" size={16} /></span></div>
        <h1>Trip HQ</h1>
        <p className="muted">Plan the trip together. Share it with everyone.</p>
        {mode === 'up' && <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>}
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
        {mode !== 'reset' && (
          <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            minLength={mode === 'up' ? 8 : undefined} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        )}
        {msg && <p className="warn">{msg}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Email me a reset link'}
        </button>
        {mode === 'in' && <button type="button" className="link-btn" onClick={() => { setMode('reset'); setMsg(''); }}>Forgot password?</button>}
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(''); }}>
          {mode === 'in' ? 'New here? Create an account' : 'Back to sign in'}
        </button>
      </form>
    </div>
  );
}

export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await backend.updatePassword(pw);
      onDone();
    } catch (err) {
      setMsg((err as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="center-screen">
      <form className="card narrow auth" onSubmit={submit}>
        <div className="logo"><span className="mark"><Icon name="lock" size={16} /></span></div>
        <h1>Set a new password</h1>
        <p className="muted">At least 8 characters.</p>
        <Field label="New password"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus /></Field>
        {msg && <p className="warn">{msg}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '…' : 'Save password'}</button>
      </form>
    </div>
  );
}

export function TripPicker({ trips, user, joinCode, onOpen, onSignOut }: {
  trips: Trip[]; user: User; joinCode: string | null; onOpen: (id: string) => void; onSignOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [code, setCode] = useState(joinCode ?? '');
  const [name, setName] = useState(user.name);
  const [nt, setNt] = useState({ name: '', destination: 'Bali, Indonesia', start_date: '', end_date: '' });
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg('');
    try {
      onOpen(await fn());
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  const cloud = backend.mode === 'cloud';

  return (
    <div className="center-screen">
      <div className="card narrow picker">
        <div className="logo"><span className="mark"><Icon name="directions" size={16} /></span></div>
        <h1>Your trips</h1>
        {msg && <p className="warn">{msg}</p>}
        {cloud && (
          <Field label="Your name (shown to your group)"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        )}
        {cloud && (
          <form className="picker-sec" onSubmit={(e) => { e.preventDefault(); void run(() => backend.joinTrip(code.trim(), name)); }}>
            <h3>Join your group’s trip</h3>
            <div className="paste-row">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Invite code" />
              <button className="btn btn-primary" disabled={!code.trim() || busy}>Join</button>
            </div>
          </form>
        )}
        {trips.length > 0 && (
          <div className="picker-sec">
            <h3>Open a trip</h3>
            {trips.map((t) => <button key={t.id} className="trip-btn" onClick={() => onOpen(t.id)}>{t.name}</button>)}
          </div>
        )}
        <form className="picker-sec" onSubmit={(e) => {
          e.preventDefault();
          void run(() => backend.createTrip({ ...nt, start_date: nt.start_date || null, end_date: nt.end_date || null, display_name: name }));
        }}>
          <h3>Start a new trip</h3>
          <Field label="Trip name"><input value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} placeholder="e.g. Bali 2027" required /></Field>
          <Field label="Destination"><input value={nt.destination} onChange={(e) => setNt({ ...nt, destination: e.target.value })} /></Field>
          <div className="row2">
            <Field label="Start"><input type="date" value={nt.start_date} onChange={(e) => setNt({ ...nt, start_date: e.target.value })} /></Field>
            <Field label="End"><input type="date" value={nt.end_date} min={nt.start_date} onChange={(e) => setNt({ ...nt, end_date: e.target.value })} /></Field>
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>Create trip</button>
        </form>
        <div className="picker-sec">
          <button className="btn btn-block" disabled={busy} onClick={() => run(() => seedExampleTrip(backend, name || 'You'))}>
            Load the example Bali trip
          </button>
          <p className="muted small">Made-up sample data, clearly marked. Delete it any time from settings.</p>
        </div>
        {cloud && <button className="link-btn" onClick={onSignOut}>Sign out ({user.email})</button>}
      </div>
    </div>
  );
}
