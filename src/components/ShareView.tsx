import { useCallback, useEffect, useState } from 'react';
import { backend, cache } from '../lib/config';
import { fmtRange } from '../lib/dates';
import type { SharedTrip } from '../lib/types';
import { ExampleBanner, Icon, Segmented } from '../ui';
import { DayList } from './Itinerary';
import { OverviewBody } from './Overview';

/** Public, read-only page for friends. Data comes only from get_shared_trip(). */
export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<SharedTrip | null>(() => cache.shared(token));
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'offline'>(data ? 'ok' : 'loading');
  const [view, setView] = useState<'overview' | 'itinerary'>('overview');
  const [updated, setUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await backend.getShared(token);
      if (!d) {
        setState('missing');
        return;
      }
      setData(d);
      cache.saveShared(token, d);
      setUpdated(new Date());
      setState('ok');
    } catch {
      setState((s) => (s === 'ok' || cache.shared(token) ? 'offline' : 'missing'));
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 30000);
    const onFocus = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  if (state === 'missing' && !data) {
    return <div className="center-screen"><div className="card narrow"><h2>Link not available</h2><p className="muted">This share link has been switched off or replaced. Ask the group for a new one.</p></div></div>;
  }
  if (!data) return <div className="center-screen"><div className="spinner" /></div>;

  const { trip, items } = data;
  return (
    <div className="share-page">
      <header className="share-head">
        <div className="share-head-inner">
          <span className="wordmark"><span className="mark"><Icon name="directions" size={12} /></span>Trip HQ</span>
          <span className="live">{state === 'offline' ? 'Offline, showing the last loaded version' : `Shared plan · read-only${updated ? ` · updated ${updated.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}`}</span>
        </div>
      </header>
      <main className="share-main">
        {trip.is_example && <ExampleBanner />}
        <Segmented value={view} onChange={setView} options={[{ value: 'overview', label: 'Overview' }, { value: 'itinerary', label: 'Full itinerary' }]} />
        {view === 'overview'
          ? <OverviewBody items={items} start={trip.start_date} end={trip.end_date} name={trip.name} subtitle={trip.destination ?? undefined} />
          : <DayList items={items} start={trip.start_date} end={trip.end_date} />}
        <p className="credit">{fmtRange(trip.start_date, trip.end_date)}</p>
      </main>
    </div>
  );
}
