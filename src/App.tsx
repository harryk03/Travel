import { useCallback, useEffect, useMemo, useState } from 'react';
import { Expenses } from './components/Expenses';
import { ItemForm } from './components/ItemForm';
import { Itinerary } from './components/Itinerary';
import { OverviewBody } from './components/Overview';
import { Places } from './components/Places';
import { SettingsSheet, ShareSheet } from './components/Settings';
import { ShareView } from './components/ShareView';
import { AuthScreen, SetPasswordScreen, TripPicker } from './components/Welcome';
import { backend, cache } from './lib/config';
import { fmtRange } from './lib/dates';
import type { Item, Trip, TripData, User } from './lib/types';
import { Ctx, ExampleBanner, Icon, type TripCtx } from './ui';

type Tab = 'overview' | 'itinerary' | 'places' | 'expenses';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'places', label: 'Places' },
  { id: 'expenses', label: 'Expenses' },
];

function useHash(): string {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const on = () => setH(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

export default function App() {
  const hash = useHash();
  const share = hash.match(/^#\/s\/([0-9a-f-]{36})/i);
  if (share) return <ShareView token={share[1]} />;
  const join = hash.match(/^#\/join\/([a-z0-9]+)/i);
  return <Member joinCode={join ? join[1] : null} />;
}

function Member({ joinCode }: { joinCode: string | null }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tripId, setTripId] = useState<string | null>(() => cache.lastTripId());

  useEffect(() => {
    const apply = (u: User | null) => {
      if (!u && backend.mode === 'cloud') cache.clearAll();
      setUser(u);
    };
    void backend.currentUser().then(apply);
    return backend.onAuthChange(apply);
  }, []);

  useEffect(() => {
    if (!user) return;
    backend.listTrips()
      .then((t) => {
        setTrips(t);
        cache.saveTrips(t);
      })
      .catch(() => setTrips(cache.trips() ?? []));
  }, [user, tripId]);

  const open = (id: string | null) => {
    setTripId(id);
    cache.setLastTripId(id);
    if (location.hash.startsWith('#/join')) history.replaceState(null, '', location.pathname);
  };
  const signOut = async () => {
    await backend.signOut();
    cache.clearAll();
    setTrips(null);
    setTripId(null);
  };

  if (user === undefined) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <AuthScreen />;
  if (backend.recoveryMode()) return <SetPasswordScreen onDone={() => setUser({ ...user })} />;
  if (!trips) return <div className="center-screen"><div className="spinner" /></div>;
  const known = tripId && trips.some((t) => t.id === tripId);
  if (joinCode || !known) {
    return <TripPicker trips={trips} user={user} joinCode={joinCode} onOpen={open} onSignOut={signOut} />;
  }
  return <TripScreen key={tripId} tripId={tripId!} user={user} onSwitch={() => open(null)} onSignOut={signOut} />;
}

function TripScreen({ tripId, user, onSwitch, onSignOut }: { tripId: string; user: User; onSwitch: () => void; onSignOut: () => void }) {
  const [data, setData] = useState<TripData | null>(() => cache.trip(tripId));
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (sessionStorageGet('tab') as Tab) || 'overview');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [sheet, setSheet] = useState<'share' | 'settings' | null>(null);
  const [toastMsg, setToastMsg] = useState('');

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg((cur) => (cur === m ? '' : cur)), 2600);
  }, []);

  const reload = useCallback(async () => {
    try {
      const d = await backend.loadTrip(tripId);
      setData(d);
      cache.saveTrip(d);
      setOffline(false);
    } catch (e) {
      if (!navigator.onLine || cache.trip(tripId)) setOffline(true);
      else toast((e as Error).message);
    }
  }, [tripId, toast]);

  useEffect(() => {
    void reload();
    const unsub = backend.subscribe(tripId, () => void reload());
    const onVis = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => {
      unsub();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onVis);
    };
  }, [tripId, reload]);

  useEffect(() => sessionStorageSet('tab', tab), [tab]);

  const ctx: TripCtx | null = useMemo(() => {
    if (!data) return null;
    const me = data.members.find((m) => m.user_id === user.id);
    return {
      data, me: user, isOwner: me?.role === 'owner', offline, backend, toast,
      editItem: (i) => setEditing(i),
      act: async (fn, done) => {
        try {
          await fn();
          if (done) toast(done);
          await reload();
          return true;
        } catch (e) {
          toast(navigator.onLine ? (e as Error).message : 'You’re offline — changes need a connection.');
          return false;
        }
      },
    };
  }, [data, user, offline, toast, reload]);

  if (!ctx || !data) return <div className="center-screen"><div className="spinner" /></div>;
  const { trip } = data;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <nav className="sidebar" aria-label="Sections">
          <div className="wordmark"><span className="mark"><Icon name="directions" size={12} /></span>Trip HQ</div>
          <p className="side-label">{trip.name}</p>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'nav-btn on' : 'nav-btn'} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
              <Icon name={t.id} size={16} /><span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="main">
          <header className="topbar">
            <div className="trip">
              <div className="trip-name">{trip.name}</div>
              <div className="trip-dates">{fmtRange(trip.start_date, trip.end_date)}</div>
            </div>
            <button className="btn btn-ghost" onClick={() => setSheet('share')} aria-label="Share"><Icon name="share" size={16} /><span className="share-label">Share</span></button>
            <button className="icon-btn" onClick={() => setSheet('settings')} aria-label="Trip settings"><Icon name="settings" size={18} /></button>
          </header>

          <main className="content">
            {offline && <p className="note"><span className="note-dot warn-dot" />Offline, showing your last synced plans. Editing is paused</p>}
            {backend.mode === 'demo' && <p className="note"><span className="note-dot" />Demo mode, data stays in this browser only</p>}
            {trip.is_example && <ExampleBanner />}
            {tab === 'overview' && (
              <div className="page">
                <OverviewBody items={data.items} start={trip.start_date} end={trip.end_date}
                  name={trip.name} subtitle={[trip.destination, `${data.travellers.length} ${data.travellers.length === 1 ? 'traveller' : 'travellers'}`].filter(Boolean).join(' · ')}
                  onOpen={offline ? undefined : (i) => setEditing(i)}
                  onToggleStatus={offline ? undefined : (i) => void ctx.act(() => backend.save('items', { ...i, status: i.status === 'confirmed' ? 'tentative' : 'confirmed' }))} />
              </div>
            )}
            {tab === 'itinerary' && <Itinerary />}
            {tab === 'places' && <Places />}
            {tab === 'expenses' && <Expenses />}
          </main>
        </div>

        <nav className="tabbar" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
              <Icon name={t.id} size={20} /><span>{t.label}</span>
            </button>
          ))}
        </nav>

        {editing && <ItemForm initial={editing} onClose={() => setEditing(null)} />}
        {sheet === 'share' && <ShareSheet onClose={() => setSheet(null)} />}
        {sheet === 'settings' && <SettingsSheet onClose={() => setSheet(null)} onSwitchTrip={() => { setSheet(null); onSwitch(); }} onSignOut={onSignOut} />}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </div>
    </Ctx.Provider>
  );
}

function sessionStorageGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function sessionStorageSet(k: string, v: string) {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}
