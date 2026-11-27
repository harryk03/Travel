// Map of saved places and stays. Loaded on demand: MapLibre is only fetched when the map is opened.
// Tiles: OpenFreeMap (free, no key, no sign-up; OpenStreetMap data). Uses MapLibre's CSP build with a
// self-hosted worker, so the site's Content-Security-Policy needs no blob: workers or eval.
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  emoji: string;
  label: string;
}

const ML = maplibregl;
ML.setWorkerUrl(workerUrl);

const BALI: [number, number] = [115.15, -8.68]; // lng, lat
const LABEL_ZOOM = 12.5;

function isDark(): boolean {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced) return forced === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}
const styleUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`;

/** Built with DOM nodes (not an HTML string) so place names can never inject markup. */
function pinElement(p: Pin, on: boolean, onClick: () => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = on ? 'pin on' : 'pin';
  el.setAttribute('aria-label', p.label);
  const dot = document.createElement('span');
  dot.className = 'pin-dot';
  dot.textContent = p.emoji;
  const label = document.createElement('span');
  label.className = 'pin-label';
  label.textContent = p.label;
  el.append(dot, label);
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

export default function PlacesMap({ pins, selected, onSelect, onLocateError }: {
  pins: Pin[]; selected: string | null; onSelect: (id: string | null) => void; onLocateError?: (msg: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<MLMarker[]>([]);
  const me = useRef<MLMarker | null>(null);
  const fitted = useRef('');
  const select = useRef(onSelect);
  select.current = onSelect;

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    let dark = isDark();
    const m = new ML.Map({
      container: box.current, style: styleUrl(dark), center: BALI, zoom: 10,
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, maxZoom: 19,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new ML.NavigationControl({ showCompass: false }), 'top-right');
    const labels = () => box.current?.classList.toggle('show-labels', m.getZoom() >= LABEL_ZOOM);
    m.on('zoomend', labels);
    m.on('click', () => select.current(null));
    labels();
    map.current = m;
    // Follow the app's light/dark setting.
    const retheme = () => { const d = isDark(); if (d !== dark) { dark = d; m.setStyle(styleUrl(d)); } };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', retheme);
    const obs = new MutationObserver(retheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq?.removeEventListener?.('change', retheme);
      obs.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Draw pins; fit the view when the set of pins changes (not when one is selected).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = pins.map((p) => {
      const on = p.id === selected;
      const el = pinElement(p, on, () => select.current(p.id));
      if (on) el.style.zIndex = '2';
      return new ML.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    const key = pins.map((p) => p.id).sort().join(',');
    if (key !== fitted.current) {
      fitted.current = key;
      if (pins.length === 1) m.jumpTo({ center: [pins[0].lng, pins[0].lat], zoom: 15 });
      else if (pins.length > 1) {
        const b = new ML.LngLatBounds();
        pins.forEach((p) => b.extend([p.lng, p.lat]));
        m.fitBounds(b, { padding: 56, maxZoom: 15, duration: 0 });
      }
    }
  }, [pins, selected]);

  // Keep the selected pin in view.
  useEffect(() => {
    const m = map.current;
    const p = pins.find((x) => x.id === selected);
    if (!m || !p) return;
    const pt = m.project([p.lng, p.lat]);
    const { clientWidth: w, clientHeight: h } = m.getContainer();
    if (pt.x < w * 0.15 || pt.x > w * 0.85 || pt.y < h * 0.15 || pt.y > h * 0.85) m.easeTo({ center: [p.lng, p.lat], duration: 300 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    if (!navigator.geolocation) return onLocateError?.('This browser can’t share your location');
    navigator.geolocation.getCurrentPosition((pos) => {
      const m = map.current;
      if (!m) return;
      const at: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      if (!me.current) {
        const dot = document.createElement('span');
        dot.className = 'me-dot';
        me.current = new ML.Marker({ element: dot }).setLngLat(at).addTo(m);
      } else me.current.setLngLat(at);
      m.easeTo({ center: at, zoom: Math.max(m.getZoom(), 14), duration: 500 });
    }, () => onLocateError?.('Location is off for this site. Allow it in your browser settings to see where you are'),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };

  return (
    <div className="map-wrap">
      <div ref={box} className="map" role="application" aria-label="Map of saved places" />
      <button type="button" className="map-locate" aria-label="Show where I am" title="Show where I am" onClick={locate}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </svg>
      </button>
    </div>
  );
}
