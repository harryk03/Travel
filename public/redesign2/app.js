// Trip HQ redesign 2: example data only, not connected to the real trip.
// Look: unslop pass (Damir Sokolovsky, @heydamir, CC BY 4.0). Interaction: Apple fluid-interface principles —
// springs from the current value, velocity hand-off, momentum projection, rubber-banding, interruptible gestures.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const haptic = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };
  document.addEventListener('touchstart', () => {}, { passive: true }); // enables :active press states on iOS

  // ---------- Motion engine ----------
  // Apple-style parameters: response (s) = how fast it gets there, damping ratio = overshoot (1 = none).
  class Spring {
    constructor(value, onUpdate) { this.x = value; this.v = 0; this.target = value; this.onUpdate = onUpdate; this.raf = 0; }
    to(target, { response = 0.35, damping = 1, velocity, onRest } = {}) {
      this.target = target; this.onRest = onRest;
      if (velocity !== undefined) this.v = velocity;
      this.k = (2 * Math.PI / response) ** 2; this.c = (4 * Math.PI * damping) / response;
      if (reduce.matches) { this.jump(target); onRest && onRest(); return this; }
      if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.step(t)); }
      return this;
    }
    step(now) {
      let dt = Math.min(0.064, (now - this.last) / 1000); this.last = now;
      const h = 1 / 240;
      while (dt > 0) { const s = Math.min(h, dt); const a = -this.k * (this.x - this.target) - this.c * this.v; this.v += a * s; this.x += this.v * s; dt -= s; }
      if (Math.abs(this.v) < 0.5 && Math.abs(this.x - this.target) < 0.05) {
        this.x = this.target; this.v = 0; this.raf = 0; this.onUpdate(this.x); const r = this.onRest; this.onRest = null; r && r(); return;
      }
      this.onUpdate(this.x); this.raf = requestAnimationFrame((t) => this.step(t));
    }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.onRest = null; return this; } // keeps the presentation value
    jump(x) { this.stop(); this.x = x; this.target = x; this.v = 0; this.onUpdate(x); return this; }
  }
  // Apple's momentum projection (from the Designing Fluid Interfaces sample code).
  const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
  const rubberband = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
  class Velocity {
    constructor() { this.pts = []; }
    add(p, t = performance.now()) { this.pts.push([p, t]); while (this.pts.length > 2 && t - this.pts[0][1] > 100) this.pts.shift(); }
    get() { const a = this.pts[0], b = this.pts[this.pts.length - 1]; if (!a || b[1] - a[1] < 8) return 0; return ((b[0] - a[0]) / (b[1] - a[1])) * 1000; }
  }

  // ---------- Icons ----------
  const P = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    pin: 'M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
    share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
    settings: 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4',
    flight: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
    stay: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9',
    activity: 'm8 3 4 8 5-5 5 15H2L8 3z',
    event: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2',
    food: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
    transport: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2M7 17h10M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0M19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    other: 'm19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
    lock: 'M5 11h14v10H5zM7 11V7a5 5 0 0 1 10 0v4',
    map: 'M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9a1 1 0 0 1 1.4.9v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.8a1 1 0 0 1-1.4-.9V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0zM15 5.8v15M9 3.2v15',
    directions: 'm3 11 19-9-9 19-2-8-8-2z',
    plus: 'M12 5v14M5 12h14',
    x: 'M18 6 6 18M6 6l12 12',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"${n === 'grip' ? ' stroke-width="2.6"' : ''}/></svg>`;

  // ---------- Example data ----------
  const TODAY = '2026-12-27';
  const people = ['You', 'Alex', 'Jordan', 'Sam', 'Riley'];
  const stays = [
    { from: '2026-12-23', to: '2026-12-26', area: 'Seminyak', title: 'Accommodation to book', status: 'tentative' },
    { from: '2026-12-26', to: '2026-12-30', area: 'Uluwatu', title: 'Pool villa, Uluwatu', status: 'confirmed', loc: 'Pecatu' },
    { from: '2026-12-30', to: '2027-01-03', area: 'Canggu', title: 'Four-bedroom villa, Canggu', status: 'confirmed', loc: 'Pererenan' },
    { from: '2027-01-03', to: '2027-01-05', area: 'Berawa', title: 'Industrial villa, Berawa', status: 'confirmed', loc: 'Berawa' },
  ];
  let pid = 0;
  const plans = [
    { day: '2026-12-23', t: '10:05', e: '13:20', kind: 'flight', title: 'JQ88 Newcastle to Bali', loc: 'Ngurah Rai Airport', status: 'confirmed', note: 'Lands 1:20pm local time', priv: 'Only You, Alex, Jordan', ref: 'Ref EXMPL1' },
    { day: '2026-12-23', t: '14:30', kind: 'transport', title: 'Driver to Seminyak', status: 'tentative' },
    { day: '2026-12-26', t: '14:00', kind: 'stay', title: 'Check in, Pool villa', loc: 'Pecatu', status: 'confirmed', note: 'Check-in from 2pm, out by 12pm on 30 Dec' },
    { day: '2026-12-27', t: '08:30', kind: 'food', title: 'Breakfast at the warung', loc: 'Bingin', status: 'tentative' },
    { day: '2026-12-27', t: '10:00', e: '12:00', kind: 'activity', title: 'Surf lesson', loc: 'Padang Padang', status: 'confirmed', ref: 'Ref SURF-204' },
    { day: '2026-12-27', t: '16:00', kind: 'event', title: 'Beach club afternoon', loc: 'Uluwatu', status: 'tentative', note: 'The other two groups are welcome' },
    { day: '2026-12-27', t: '19:30', kind: 'food', title: 'Seafood dinner', loc: 'Jimbaran Bay', status: 'tentative' },
    { day: '2026-12-28', t: '02:00', kind: 'activity', title: 'Mount Batur sunrise trek', loc: 'Kintamani', status: 'confirmed', note: 'Pick-up 2am at the villa', ref: 'Ref TREK-88' },
    { day: '2026-12-29', t: '07:30', kind: 'activity', title: 'Gym session', loc: 'Uluwatu', status: 'tentative' },
    { day: '2026-12-30', t: '15:00', kind: 'stay', title: 'Check in, Four-bedroom villa', loc: 'Pererenan', status: 'confirmed', note: 'Someone meets you at the gate' },
    { day: '2026-12-31', t: '21:00', kind: 'event', title: 'New Year’s Eve, all three groups', loc: 'Canggu', status: 'tentative' },
    { day: '2027-01-03', t: '15:00', kind: 'stay', title: 'Check in, Industrial villa', loc: 'Berawa', status: 'confirmed' },
    { day: '2027-01-05', t: '23:40', e: '08:35', kind: 'flight', title: 'JQ89 Bali to Newcastle', loc: 'Ngurah Rai Airport', status: 'confirmed', note: 'Lands Newcastle 8:35am on 6 Jan', priv: 'Only You, Alex, Jordan', ref: 'Ref EXMPL2' },
  ].map((p) => ({ ...p, id: 'p' + pid++ }));
  const places = [
    { emo: '🏖️', cat: 'Beach clubs', name: 'Cliffside beach club', area: 'Uluwatu', note: 'Book a daybed for five' },
    { emo: '☕', cat: 'Cafés', name: 'Corner espresso bar', area: 'Bingin' },
    { emo: '🍽️', cat: 'Restaurants', name: 'Warung by the steps', area: 'Bingin', note: 'Cash only' },
    { emo: '🍸', cat: 'Nightlife', name: 'Rooftop bar', area: 'Seminyak' },
    { emo: '🌋', cat: 'Activities', name: 'Mount Batur sunrise trek', area: 'Kintamani' },
    { emo: '🏋️', cat: 'Gyms', name: 'Open-air gym', area: 'Canggu' },
    { emo: '🏨', cat: 'Accommodation', name: 'Boutique hotel, Seminyak', area: 'Seminyak', note: 'Option for 23–26 Dec' },
    { emo: '🍽️', cat: 'Restaurants', name: 'Jimbaran seafood', area: 'Jimbaran Bay' },
  ];
  let eid = 0;
  const expenses = [
    { title: 'Pool villa, Uluwatu', by: 'You', amt: 1420.0, date: '25 Nov', split: 'split 5 ways' },
    { title: 'Four-bedroom villa, Canggu', by: 'Sam', amt: 3410.0, date: '25 Nov', split: 'split 5 ways' },
    { title: 'Industrial villa, Berawa', by: 'You', amt: 1380.5, date: '25 Dec', split: 'split 5 ways' },
    { title: 'Surf lesson', by: 'Alex', amt: 310.0, date: '27 Dec', split: 'split 5 ways' },
    { title: 'Jordan paid You', by: 'Jordan', amt: 561, date: '27 Dec', repay: 'You' },
  ].map((e) => ({ ...e, id: 'e' + eid++ }));

  // ---------- Helpers ----------
  const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
  const fmtDay = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => d(s).toLocaleDateString('en-AU', o);
  const between = (a, b) => Math.round((d(b) - d(a)) / 864e5);
  const time = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; const hh = h % 12 || 12; return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`; };
  const aud = (n, whole) => 'A$' + n.toLocaleString('en-AU', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  const start = '2026-12-23', end = '2027-01-05';
  const dayN = between(start, TODAY) + 1, total = between(start, end) + 1;
  const days = []; for (let i = 0; i < total; i++) { const x = d(start); x.setDate(x.getDate() + i); days.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`); }
  const stayOn = (day) => stays.find((s) => s.from <= day && day < s.to);
  const status = (s, btn, id) => `<${btn ? `button type="button" data-status="${id}"` : 'span'} class="status ${s}"><i></i>${s === 'confirmed' ? 'Confirmed' : 'Tentative'}</${btn ? 'button' : 'span'}>`;
  const links = (q) => `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ', Bali')}" target="_blank" rel="noreferrer">${icon('map')}Map</a><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q + ', Bali')}" target="_blank" rel="noreferrer">${icon('directions')}Directions</a>`;

  const planRow = (p, opts = {}) => `
    <div class="plan ${opts.next ? 'next' : ''}" tabindex="0" data-open="plan" data-key="${p.id}" data-id="${p.id}">
      <div class="plan-time">${opts.showDay ? `<span>${fmtDay(p.day, { day: 'numeric', month: 'short' })}</span><span class="end">${time(p.t)}</span>` : `${time(p.t) || '<span class="muted">–</span>'}${p.e ? `<span class="end">${time(p.e)}</span>` : ''}`}</div>
      <div class="plan-rail"><span class="stop-dot"></span></div>
      <div class="plan-body">
        <div class="plan-line1">${icon(p.kind)}<span class="plan-title">${p.title}</span></div>
        <div class="plan-meta">${p.loc ? `<span>${p.loc}</span><span class="sep">·</span>` : ''}${status(p.status, opts.edit, p.id)}</div>
        ${p.note ? `<p class="plan-note">${p.note}</p>` : ''}
        ${p.priv || p.ref ? `<span class="plan-private">${icon('lock')}${[p.priv, p.ref].filter(Boolean).join(' · ')}</span>` : ''}
        ${p.loc && !opts.compact ? `<div class="plan-links">${links(p.loc)}</div>` : ''}
      </div>
      ${opts.grip ? `<button class="grip" type="button" aria-label="Drag to reorder ${p.title}">${icon('grip')}</button>` : '<span></span>'}
    </div>`;

  // Who pays who: everyone pays back whoever paid; only pairs net out; rounded up to whole dollars.
  function ledger() {
    const owed = {}; const add = (a, b, v) => (owed[a + '|' + b] = (owed[a + '|' + b] || 0) + v);
    expenses.forEach((e) => { if (e.repay) add(e.repay, e.by, e.amt); else people.forEach((p) => p !== e.by && add(p, e.by, e.amt / 5)); });
    const owe = []; const seen = new Set();
    Object.keys(owed).forEach((k) => { const [a, b] = k.split('|'); const key = [a, b].sort().join('|'); if (seen.has(key)) return; seen.add(key);
      const net = (owed[a + '|' + b] || 0) - (owed[b + '|' + a] || 0); const amt = Math.abs(net) < 1 ? 0 : Math.ceil(Math.abs(net) - 1e-9);
      if (amt) owe.push(net > 0 ? { from: a, to: b, amt } : { from: b, to: a, amt }); });
    owe.sort((x, y) => people.indexOf(x.from) - people.indexOf(y.from) || people.indexOf(x.to) - people.indexOf(y.to));
    const net = {}; people.forEach((p) => (net[p] = 0)); owe.forEach((o) => { net[o.from] -= o.amt; net[o.to] += o.amt; });
    return { owe, net };
  }
  const balText = (v) => (Math.round(v) > 0 ? `gets back ${aud(Math.round(v), true)}` : Math.round(v) < 0 ? `owes ${aud(-Math.round(v), true)}` : 'settled');

  // ---------- Views ----------
  function overview() {
    const now = stayOn(TODAY);
    const todays = plans.filter((p) => p.day === TODAY);
    const next = plans.filter((p) => p.day > TODAY).slice(0, 4);
    const stops = [{ k: '23 Dec', v: 'Arrive', key: 'arrive' }, ...stays.map((s) => ({ k: fmtDay(s.from, { day: 'numeric', month: 'short' }), v: s.area, s })), { k: '5 Jan', v: 'Fly home', key: 'home' }];
    return `
      <section class="pass" aria-label="Trip pass">
        <div class="pass-main">
          <div class="pass-top"><span>Trip pass</span><span>NTL → DPS → NTL</span></div>
          <h1 class="pass-title">Bali NYE</h1>
          <p class="pass-dates">Wed 23 Dec – Tue 5 Jan · 5 travellers</p>
          <div class="pass-day"><b>Day ${dayN}</b><span>of ${total}</span></div>
          <div class="route">${stops.map((st) => {
            const cls = st.s ? (st.s === now ? 'now' : st.s.to <= TODAY ? 'done' : st.s.status === 'tentative' ? 'tbc' : '') : st.key === 'arrive' ? 'done' : '';
            return `<div class="stop ${cls} ${st.key || ''}"><span class="pin"></span><span class="k">${st.k}</span><span class="v">${st.v}</span></div>`;
          }).join('')}</div>
        </div>
        <div class="pass-stub">
          <p class="stub-k">Tonight</p>
          <p class="stub-v">${now.title}</p>
          <p class="stub-sub">${now.loc} · until ${fmtDay(now.to)}</p>
          <div class="stub-links">${links(now.loc)}</div>
        </div>
      </section>
      <div class="ov-grid">
        <div>
          <section class="section">
            <div class="section-head"><h2 class="section-title">Today</h2><span class="section-meta">${fmtDay(TODAY)}</span></div>
            <div class="plans">${todays.map((p, i) => planRow(p, { next: i === 1, edit: true })).join('')}</div>
          </section>
          <section class="section">
            <div class="section-head"><h2 class="section-title">Coming up</h2><span class="section-meta">Next ${next.length}</span></div>
            <div class="plans">${next.map((p) => planRow(p, { showDay: true, compact: true })).join('')}</div>
          </section>
        </div>
        <section class="section" style="margin-top:0">
          <div class="section-head"><h2 class="section-title">Where you’re staying</h2><span class="section-meta">${stays.length} stays</span></div>
          <div class="card" style="padding:16px 20px"><div class="stays">${stays.map((s) => {
            const isNow = s === now; const past = s.to <= TODAY;
            return `<div class="stay"><span class="stay-k ${isNow ? 'now' : ''}">${isNow ? 'Staying now' : past ? 'Stayed' : 'From'} · ${fmtDay(s.from, { day: 'numeric', month: 'short' })} – ${fmtDay(s.to, { day: 'numeric', month: 'short' })}</span>
              <span class="stay-title">${s.title}</span>${status(s.status)}
              <span class="stay-sub">${s.loc ? s.loc : 'Still to book'}</span></div>`;
          }).join('')}</div></div>
        </section>
      </div>`;
  }

  function itinerary() {
    return `
      <div class="page-head"><div><h1 class="page-title">Itinerary</h1><p class="page-sub">${plans.length} plans over ${total} days</p></div>
        <button class="btn btn-primary" data-open="plan">${icon('plus')}Add plan</button></div>
      <div class="itin">${days.map((day, i) => {
        const ps = plans.filter((p) => p.day === day);
        const st = stayOn(day); const checkIn = ps.some((p) => p.kind === 'stay');
        return `<section class="day ${day === TODAY ? 'today' : ''}">
          <div class="day-head"><span class="day-n">Day ${i + 1}</span><h2 class="day-date">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>${day === TODAY ? '<span class="today-tag">Today</span>' : ''}</div>
          ${st && !checkIn ? `<p class="staying">${icon('stay')}${st.status === 'tentative' ? 'Accommodation still to book' : `Staying at ${st.title}`}</p>` : ''}
          ${ps.length ? `<div class="plans" data-day="${day}">${ps.map((p) => planRow(p, { edit: true, grip: ps.length > 1 })).join('')}</div>` : ''}
          <button class="add-row" data-open="plan">${icon('plus')}Add to ${fmtDay(day, { day: 'numeric', month: 'short' })}</button>
        </section>`;
      }).join('')}</div>`;
  }

  let placeFilter = 'All';
  function placesView() {
    const cats = [...new Set(places.map((p) => p.cat))];
    const shown = places.filter((p) => placeFilter === 'All' || p.cat === placeFilter);
    return `
      <div class="page-head"><div><h1 class="page-title">Saved places</h1><p class="page-sub">Paste a Google Maps link to save a place</p></div></div>
      <form class="card paste">
        <label class="field-label" for="paste">Google Maps link</label>
        <div class="paste-row"><input class="input" id="paste" placeholder="maps.app.goo.gl/…" inputmode="url" /><button class="btn btn-primary">Add</button></div>
        <button type="button" class="link-btn" data-open="plan">Add a place by hand</button>
      </form>
      <div class="chips" role="toolbar" aria-label="Filter by category">
        <button class="chip" data-filter="All" aria-pressed="${placeFilter === 'All'}">All <span class="n">${places.length}</span></button>
        ${cats.map((c) => { const p = places.find((x) => x.cat === c); return `<button class="chip" data-filter="${c}" aria-pressed="${placeFilter === c}">${p.emo} ${c} <span class="n">${places.filter((x) => x.cat === c).length}</span></button>`; }).join('')}
      </div>
      <div class="place-grid">${shown.map((p) => `
        <div class="card place" data-key="pl-${p.name}"><span class="emo" aria-hidden="true">${p.emo}</span><div>
          <p class="place-name">${p.name}</p><p class="place-area">${p.area}</p>${p.note ? `<p class="place-note">${p.note}</p>` : ''}
          <div class="place-links">${links(p.name + ' ' + p.area)}<button type="button" data-open="plan">${icon('plus')}Itinerary</button></div>
        </div></div>`).join('')}</div>`;
  }

  function expensesView() {
    const spend = expenses.filter((e) => !e.repay).reduce((a, e) => a + e.amt, 0);
    const paid = {}; people.forEach((p) => (paid[p] = 0)); expenses.filter((e) => !e.repay).forEach((e) => (paid[e.by] += e.amt));
    const { owe, net } = ledger();
    const payers = people.filter((p) => paid[p] > 0).sort((a, b) => paid[b] - paid[a]);
    const shades = ['var(--accent)', 'var(--text2)', 'var(--muted)', 'var(--line-strong)'];
    return `
      <div class="page-head"><div><h1 class="page-title">Expenses</h1><p class="page-sub">Everyone pays back whoever paid</p></div>
        <button class="btn btn-primary">${icon('plus')}Add expense</button></div>
      <div class="seg" role="group" aria-label="Currency"><button aria-pressed="true">AUD</button><button aria-pressed="false">IDR</button></div>
      <div class="ex-grid">
        <div>
          <section class="card spend">
            <p class="spend-k">Group spend</p>
            <p class="spend-v">${aud(spend)}</p>
            <div class="paidbar" aria-hidden="true">${payers.map((p, i) => `<span style="flex:${paid[p]};background:${shades[i] || shades[3]}"></span>`).join('')}</div>
            <div class="legend">${payers.map((p, i) => `<span><i style="background:${shades[i] || shades[3]}"></i>${p} paid<b>${aud(paid[p], true)}</b></span>`).join('')}</div>
            <div class="balances">${people.map((p) => `<div class="bal" data-key="bal-${p}"><span>${p}</span><span class="amt ${net[p] > 0 ? 'pos' : net[p] < 0 ? 'neg' : 'muted'}" data-num="bal-${p}" data-val="${net[p]}">${balText(net[p])}</span></div>`).join('')}</div>
          </section>
          <section class="section">
            <div class="section-head"><h2 class="section-title">All expenses</h2><span class="section-meta">${expenses.length}</span></div>
            <div class="list">${[...expenses].reverse().map((e) => `<div class="exp ${e.repay ? 'repay' : ''}" tabindex="0" data-key="${e.id}"><span class="exp-title">${e.title}</span><span class="exp-amt">${aud(e.amt)}</span>
              <span class="exp-sub">${e.repay ? 'Repayment' : `Paid by ${e.by} · ${e.split}`} · ${e.date}</span></div>`).join('')}</div>
          </section>
        </div>
        <section class="section" style="margin-top:0">
          <div class="section-head"><h2 class="section-title">Who pays who</h2><span class="section-meta">Rounded up</span></div>
          <div class="ledger">${owe.length ? owe.map((o) => `<div class="owe" data-key="owe-${o.from}-${o.to}"><span class="who">${o.from}<span class="arrow">→</span>${o.to}</span><span class="amt">${aud(o.amt, true)}</span><button class="btn" style="height:32px;padding:0 12px" data-record="${o.from}|${o.to}|${o.amt}">Record</button></div>`).join('') : '<p class="muted" style="padding:12px 0">Everyone’s square</p>'}</div>
        </section>
      </div>`;
  }

  // ---------- Render with FLIP and number tweens ----------
  const tabs = [['overview', 'Overview', 'home', overview], ['itinerary', 'Itinerary', 'calendar', itinerary], ['places', 'Places', 'pin', placesView], ['expenses', 'Expenses', 'wallet', expensesView]];
  const view = $('#view');
  let tab = location.hash.slice(1) || 'overview'; if (!tabs.some((t) => t[0] === tab)) tab = 'overview';
  const tabIndex = () => tabs.findIndex((t) => t[0] === tab);

  function rerender() { // same tab: keyed rows glide to their new places, numbers count to new values
    const before = new Map($$('[data-key]', view).map((el) => [el.dataset.key, el.getBoundingClientRect().top]));
    const nums = new Map($$('[data-num]', view).map((el) => [el.dataset.num, Number(el.dataset.val)]));
    view.innerHTML = tabs[tabIndex()][3]();
    $$('[data-key]', view).forEach((el) => {
      const top = before.get(el.dataset.key); if (top === undefined) return;
      const dy = top - el.getBoundingClientRect().top; if (Math.abs(dy) < 1) return;
      new Spring(dy, (y) => (el.style.transform = y ? `translateY(${y}px)` : '')).to(0, { response: 0.4, damping: 1 });
    });
    $$('[data-num]', view).forEach((el) => {
      const from = nums.get(el.dataset.num), to = Number(el.dataset.val); if (from === undefined || from === to) return;
      new Spring(from, (v) => (el.textContent = balText(v))).to(to, { response: 0.55, damping: 1 });
    });
  }

  const viewSpring = new Spring(0, (x) => { view.style.transform = x ? `translate3d(${x}px,0,0)` : ''; view.style.opacity = String(Math.max(0, 1 - Math.abs(x) / (view.offsetWidth * 0.9))); });
  function go(id, { velocity = 0, fromX } = {}) { // spatial: content arrives from the side you're moving towards
    const oldI = tabIndex(); tab = id; const newI = tabIndex(); const dir = Math.sign(newI - oldI) || 1;
    history.replaceState(null, '', '#' + tab);
    view.innerHTML = tabs[newI][3](); scrollTo(0, 0); syncNav(true);
    viewSpring.jump(fromX ?? dir * Math.min(48, view.offsetWidth * 0.12));
    viewSpring.to(0, { response: 0.38, damping: 1, velocity });
    edges();
  }

  // ---------- Navigation with moving highlights ----------
  const tabbar = $('#tabbar'), sideNav = $('#side-nav');
  tabbar.innerHTML = `<span class="tab-ind"></span>` + tabs.map(([id, l, ic]) => `<button data-tab="${id}">${icon(ic, 'lg')}<span>${l}</span></button>`).join('');
  sideNav.innerHTML = `<span class="side-ind"></span>` + tabs.map(([id, l, ic]) => `<button class="nav" data-tab="${id}">${icon(ic)}<span>${l}</span></button>`).join('');
  const tabInd = $('.tab-ind'), sideInd = $('.side-ind');
  const tabX = new Spring(0, (x) => (tabInd.style.transform = `translate3d(${x}px,0,0)`));
  const sideY = new Spring(0, (y) => (sideInd.style.transform = `translate3d(0,${y}px,0)`));
  function syncNav(animate) {
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    const tb = $(`.tabbar [data-tab="${tab}"]`), sb = $(`.nav[data-tab="${tab}"]`);
    if (tb && tb.offsetWidth) { const w = tb.offsetWidth - 16; tabInd.style.width = w + 'px'; const x = tb.offsetLeft + 8; animate ? tabX.to(x, { response: 0.35, damping: 0.85 }) : tabX.jump(x); }
    if (sb && sb.offsetHeight) { const y = sb.offsetTop; animate ? sideY.to(y, { response: 0.35, damping: 1 }) : sideY.jump(y); }
  }

  // ---------- Scroll edge effects ----------
  const topbar = $('.topbar');
  function edges() {
    topbar.dataset.scrolled = String(scrollY > 4);
    tabbar.dataset.under = String(scrollY + innerHeight < document.documentElement.scrollHeight - 4);
  }
  addEventListener('scroll', edges, { passive: true }); addEventListener('resize', () => { syncNav(false); edges(); });

  // ---------- Swipe between tabs ----------
  let suppressClick = false;
  view.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    if (e.target.closest('.chips, input, textarea, .grip, .sheet')) return;
    const sx = e.clientX, sy = e.clientY, vt = new Velocity(); let mode = null; const base = viewSpring.x;
    vt.add(sx);
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        if (mode === 'y') return cleanup();
        viewSpring.stop(); try { view.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
      }
      vt.add(ev.clientX);
      const i = tabIndex(); let x = base + dx;
      if ((i === 0 && x > 0) || (i === tabs.length - 1 && x < 0)) x = rubberband(x, view.offsetWidth); // soft edge
      viewSpring.jump(x);
    };
    const up = () => {
      cleanup(); if (mode !== 'x') return;
      suppressClick = true; setTimeout(() => (suppressClick = false), 0);
      const v = vt.get(), x = viewSpring.x, w = view.offsetWidth, i = tabIndex();
      const projected = x + project(v, 0.99);
      const dir = projected < -w * 0.3 ? 1 : projected > w * 0.3 ? -1 : 0;
      const target = i + dir;
      if (dir && target >= 0 && target < tabs.length) {
        haptic(6);
        viewSpring.to(-dir * w * 0.45, { response: 0.22, damping: 1, velocity: v, onRest: () => go(tabs[target][0], { fromX: dir * w * 0.35, velocity: v }) });
      } else viewSpring.to(0, { response: 0.35, damping: Math.abs(v) > 300 ? 0.8 : 1, velocity: v });
    };
    const cleanup = () => { view.removeEventListener('pointermove', move); view.removeEventListener('pointerup', up); view.removeEventListener('pointercancel', up); };
    view.addEventListener('pointermove', move); view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  });

  // ---------- Reorder by dragging the grip ----------
  view.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip'); if (!grip) return;
    e.preventDefault();
    const row = grip.closest('.plan'), list = row.parentElement, rows = [...list.children], idx = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect()), h = rects[idx].height;
    const startY = e.clientY, vt = new Velocity(); vt.add(startY);
    grip.setPointerCapture(e.pointerId);
    row.classList.add('lifted'); list.classList.add('dragging'); haptic(6);
    let scale = 1; const place = (y) => (row.style.transform = `translate3d(0,${y}px,0) scale(${scale})`);
    const lift = new Spring(1, (s) => { scale = s; place(rowY.x); }); const rowY = new Spring(0, place);
    lift.to(1.02, { response: 0.25, damping: 1 });
    const others = rows.map((r, i) => (i === idx ? null : new Spring(0, (y) => (r.style.transform = y ? `translate3d(0,${y}px,0)` : ''))));
    const minY = rects[0].top - rects[idx].top, maxY = rects[rects.length - 1].bottom - rects[idx].bottom;
    let newIdx = idx;
    const move = (ev) => {
      vt.add(ev.clientY);
      let y = ev.clientY - startY; // 1:1 with the finger, respecting where it grabbed
      if (y < minY) y = minY - rubberband(minY - y, h); else if (y > maxY) y = maxY + rubberband(y - maxY, h);
      rowY.jump(y);
      const centre = rects[idx].top + h / 2 + y;
      newIdx = rows.filter((r, i) => i !== idx && rects[i].top + rects[i].height / 2 < centre).length;
      others.forEach((s, i) => { if (!s) return; const shift = i > idx && i <= newIdx ? -h : i < idx && i >= newIdx ? h : 0; if (s.target !== shift) s.to(shift, { response: 0.3, damping: 1 }); });
    };
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
      const target = newIdx > idx ? rects.slice(idx + 1, newIdx + 1).reduce((a, r) => a + r.height, 0) : -rects.slice(newIdx, idx).reduce((a, r) => a + r.height, 0);
      const v = vt.get(); if (newIdx !== idx) haptic(10);
      lift.to(1, { response: 0.3, damping: 1 });
      rowY.to(target, { response: 0.32, damping: Math.abs(v) > 400 ? 0.82 : 1, velocity: v, onRest: () => {
        const day = list.dataset.day, ids = rows.map((r) => r.dataset.id); const moved = ids.splice(idx, 1)[0]; ids.splice(newIdx, 0, moved);
        const others2 = plans.filter((p) => p.day !== day); const ordered = ids.map((id) => plans.find((p) => p.id === id));
        plans.length = 0; plans.push(...others2, ...ordered); plans.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
        const y = scrollY; view.innerHTML = itinerary(); scrollTo(0, y); // same positions, so nothing jumps
      } });
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });

  // ---------- Sheet: drag, flick, catch mid-flight ----------
  function openSheet() {
    if ($('#bd')) return;
    const kinds = ['flight', 'stay', 'activity', 'event', 'food', 'transport', 'other'];
    const label = { flight: 'Flight', stay: 'Accommodation', activity: 'Activity', event: 'Event', food: 'Food & drink', transport: 'Transport', other: 'Other' };
    $('#sheet-root').innerHTML = `
      <div class="backdrop" id="bd"><div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Add plan">
        <div class="grabber"><span></span></div>
        <div class="sheet-head"><h2 class="sheet-title">Add plan</h2><button class="icon-btn" id="close" aria-label="Close">${icon('x')}</button></div>
        <div class="sheet-body">
          <div class="types" role="group" aria-label="Type">${kinds.map((k, i) => `<button type="button" class="type" aria-pressed="${i === 2}">${icon(k)}${label[k]}</button>`).join('')}</div>
          <label class="field"><span class="field-label">Title</span><input class="input" placeholder="What’s the plan" /></label>
          <div class="field" role="group" aria-label="Status"><span class="field-label">Status</span><div class="seg"><button type="button" aria-pressed="false" style="font-family:var(--sans)">Confirmed</button><button type="button" aria-pressed="true" style="font-family:var(--sans)">Tentative</button></div></div>
          <div class="row2"><label class="field"><span class="field-label">Day</span><input class="input" type="date" value="${TODAY}" /></label><label class="field"><span class="field-label">Start time</span><input class="input" type="time" /></label></div>
          <label class="field"><span class="field-label">Location</span><input class="input" placeholder="Place or area" /></label>
          <label class="field"><span class="field-label">Notes</span><input class="input" /><span class="hint">Visible on the share link</span></label>
          <div class="private"><span class="private-k">${icon('lock')}Travelling group only</span>
            <label class="field"><span class="field-label">Booking reference</span><input class="input" /></label>
            <label class="field"><span class="field-label">Private notes</span><input class="input" /></label></div>
        </div>
        <div class="sheet-foot"><span class="spacer"></span><button class="btn" id="cancel">Cancel</button><button class="btn btn-primary" id="save">Save</button></div>
      </div></div>`;
    const bd = $('#bd'), sheet = $('.sheet', bd), scrim = $('.scrim', bd), app = $('.app');
    const H = () => sheet.offsetHeight + 24;
    document.body.classList.add('sheet-open');
    const apply = (y) => {
      sheet.style.transform = `translate3d(0,${y}px,0)`;
      const p = Math.max(0, Math.min(1, 1 - y / H()));
      scrim.style.opacity = String(p);
      if (!reduce.matches) app.style.transform = `translate3d(0,${10 * p}px,0) scale(${1 - 0.06 * p})`; // background steps back
    };
    const sp = new Spring(H(), apply);
    if (reduce.matches) { sheet.style.transition = 'opacity 200ms ease'; sheet.style.opacity = '0'; apply(0); requestAnimationFrame(() => (sheet.style.opacity = '1')); }
    else sp.to(0, { response: 0.35, damping: 1 });
    let closing = false;
    const finish = () => { $('#sheet-root').innerHTML = ''; document.body.classList.remove('sheet-open'); app.style.transform = ''; };
    const close = (velocity = 0) => {
      closing = true;
      if (reduce.matches) { sheet.style.opacity = '0'; scrim.style.opacity = '0'; app.style.transform = ''; setTimeout(finish, 200); return; }
      sp.to(H(), { response: 0.3, damping: 1, velocity, onRest: finish }); // leaves the way it came
    };
    bd.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('#close,#cancel,#save')) close(); });
    $$('.type', bd).forEach((b) => b.addEventListener('click', () => $$('.type', bd).forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    $$('.seg button', bd).forEach((b) => b.addEventListener('click', () => b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && $('#bd')) { close(); document.removeEventListener('keydown', esc); } });

    sheet.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.grabber, .sheet-head, .sheet-foot') || e.target.closest('button:not(.grabber)')) return;
      const sy = e.clientY, base = sp.x, vt = new Velocity(); let dragging = false; vt.add(sy);
      const move = (ev) => {
        const dy = ev.clientY - sy;
        if (!dragging) { if (Math.abs(dy) < 6) return; dragging = true; closing = false; sp.stop(); sheet.setPointerCapture(ev.pointerId); } // catch it mid-flight
        vt.add(ev.clientY);
        let y = base + dy; if (y < 0) y = -rubberband(-y, H()); // soft top edge
        sp.jump(y);
      };
      const up = () => {
        sheet.removeEventListener('pointermove', move); sheet.removeEventListener('pointerup', up); sheet.removeEventListener('pointercancel', up);
        if (!dragging) return;
        const v = vt.get(); const projected = sp.x + project(v);
        if (v > 500 || (v > -500 && projected > H() * 0.5)) { haptic(6); close(v); }
        else sp.to(0, { response: 0.3, damping: Math.abs(v) > 300 ? 0.8 : 1, velocity: v }); // bounce only after a flick
      };
      sheet.addEventListener('pointermove', move); sheet.addEventListener('pointerup', up); sheet.addEventListener('pointercancel', up);
    });
  }

  // ---------- Clicks ----------
  document.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    const tb = e.target.closest('[data-tab]'); if (tb) { if (tb.dataset.tab !== tab) go(tb.dataset.tab); return; }
    const f = e.target.closest('[data-filter]'); if (f) { placeFilter = f.dataset.filter; rerender(); return; }
    if (e.target.closest('a')) return;
    const st = e.target.closest('[data-status]');
    if (st) { const p = plans.find((x) => x.id === st.dataset.status); p.status = p.status === 'confirmed' ? 'tentative' : 'confirmed'; haptic(6); rerender(); return; }
    const rec = e.target.closest('[data-record]');
    if (rec) {
      const [from, to, amt] = rec.dataset.record.split('|'); const row = rec.closest('.owe'); haptic(10);
      new Spring(0, (x) => { row.style.transform = `translate3d(${x}px,0,0)`; row.style.opacity = String(1 - x / 80); })
        .to(80, { response: 0.25, damping: 1, onRest: () => { expenses.push({ id: 'e' + eid++, title: `${from} paid ${to}`, by: from, amt: Number(amt), date: '27 Dec', repay: to }); rerender(); } });
      return;
    }
    if (e.target.closest('[data-open="plan"]') && !e.target.closest('.grip')) openSheet();
  }, true);
  document.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.plan')) openSheet(); });
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== tab && tabs.some((t) => t[0] === h)) go(h); });

  $('#mark').innerHTML = icon('directions');
  $('#share-btn').innerHTML = `${icon('share')}<span class="share-label">Share</span>`;
  $('#settings-btn').innerHTML = icon('settings', 'lg');
  view.innerHTML = tabs[tabIndex()][3]();
  requestAnimationFrame(() => { syncNav(false); edges(); });
})();
