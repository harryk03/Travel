// Trip HQ redesign test page: static prototype with example data. Not connected to the real trip.
// Design pass with unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
(() => {
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
    up: 'm18 15-6-6-6 6',
    down: 'm6 9 6 6 6-6',
    x: 'M18 6 6 18M6 6l12 12',
    arrow: 'M5 12h14M13 6l6 6-6 6',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;
  const $ = (s) => document.querySelector(s);

  // ---------- Example data ----------
  const TODAY = '2026-12-27';
  const people = ['You', 'Alex', 'Jordan', 'Sam', 'Riley'];
  const stays = [
    { from: '2026-12-23', to: '2026-12-26', area: 'Seminyak', title: 'Accommodation to book', status: 'tentative' },
    { from: '2026-12-26', to: '2026-12-30', area: 'Uluwatu', title: 'Pool villa, Uluwatu', status: 'confirmed', loc: 'Pecatu' },
    { from: '2026-12-30', to: '2027-01-03', area: 'Canggu', title: 'Four-bedroom villa, Canggu', status: 'confirmed', loc: 'Pererenan' },
    { from: '2027-01-03', to: '2027-01-05', area: 'Berawa', title: 'Industrial villa, Berawa', status: 'confirmed', loc: 'Berawa' },
  ];
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
  ];
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
  const expenses = [
    { title: 'Pool villa, Uluwatu', by: 'You', amt: 1420.0, date: '25 Nov', split: 'split 5 ways' },
    { title: 'Four-bedroom villa, Canggu', by: 'Sam', amt: 3410.0, date: '25 Nov', split: 'split 5 ways' },
    { title: 'Industrial villa, Berawa', by: 'You', amt: 1380.5, date: '25 Dec', split: 'split 5 ways' },
    { title: 'Surf lesson', by: 'Alex', amt: 310.0, date: '27 Dec', split: 'split 5 ways' },
    { title: 'Jordan paid You', by: 'Jordan', amt: 561, date: '27 Dec', repay: 'You' },
  ];

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
  const status = (s, btn) => `<${btn ? 'button type="button"' : 'span'} class="status ${s}"><i></i>${s === 'confirmed' ? 'Confirmed' : 'Tentative'}</${btn ? 'button' : 'span'}>`;
  const links = (q) => `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ', Bali')}" target="_blank" rel="noreferrer">${icon('map')}Map</a><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q + ', Bali')}" target="_blank" rel="noreferrer">${icon('directions')}Directions</a>`;

  const planRow = (p, opts = {}) => `
    <div class="plan ${opts.next ? 'next' : ''}" tabindex="0" data-open="plan">
      <div class="plan-time">${opts.showDay ? `<span>${fmtDay(p.day, { day: 'numeric', month: 'short' })}</span><span class="end">${time(p.t)}</span>` : `${time(p.t) || '<span class="muted">–</span>'}${p.e ? `<span class="end">${time(p.e)}</span>` : ''}`}</div>
      <div class="plan-rail"><span class="stop-dot"></span></div>
      <div class="plan-body">
        <div class="plan-line1">${icon(p.kind)}<span class="plan-title">${p.title}</span></div>
        <div class="plan-meta">${p.loc ? `<span>${p.loc}</span><span class="sep">·</span>` : ''}${status(p.status, opts.edit)}</div>
        ${p.note ? `<p class="plan-note">${p.note}</p>` : ''}
        ${p.priv || p.ref ? `<span class="plan-private">${icon('lock')}${[p.priv, p.ref].filter(Boolean).join(' · ')}</span>` : ''}
        ${p.loc && !opts.compact ? `<div class="plan-links">${links(p.loc)}</div>` : ''}
      </div>
      ${opts.tools ? `<div class="plan-tools"><button class="icon-btn sm" aria-label="Move up">${icon('up')}</button><button class="icon-btn sm" aria-label="Move down">${icon('down')}</button></div>` : ''}
    </div>`;

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
          <p class="stub-sub">${now.loc} · until ${fmtDay(now.to, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
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
          ${ps.length ? `<div class="plans">${ps.map((p) => planRow(p, { edit: true, tools: true })).join('')}</div>` : ''}
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
        <button type="button" class="link-btn">Add a place by hand</button>
      </form>
      <div class="chips" role="toolbar" aria-label="Filter by category">
        <button class="chip" data-filter="All" aria-pressed="${placeFilter === 'All'}">All <span class="n">${places.length}</span></button>
        ${cats.map((c) => { const p = places.find((x) => x.cat === c); return `<button class="chip" data-filter="${c}" aria-pressed="${placeFilter === c}">${p.emo} ${c} <span class="n">${places.filter((x) => x.cat === c).length}</span></button>`; }).join('')}
      </div>
      <div class="place-grid">${shown.map((p) => `
        <div class="card place"><span class="emo" aria-hidden="true">${p.emo}</span><div>
          <p class="place-name">${p.name}</p><p class="place-area">${p.area}</p>${p.note ? `<p class="place-note">${p.note}</p>` : ''}
          <div class="place-links">${links(p.name + ' ' + p.area)}<button type="button" data-open="plan">${icon('plus')}Itinerary</button></div>
        </div></div>`).join('')}</div>`;
  }

  function expensesView() {
    const spend = expenses.filter((e) => !e.repay).reduce((a, e) => a + e.amt, 0);
    const paid = {}; people.forEach((p) => (paid[p] = 0)); expenses.filter((e) => !e.repay).forEach((e) => (paid[e.by] += e.amt));
    // Who pays who: everyone pays back whoever paid; only pairs net out; rounded up to whole dollars.
    const owed = {}; const add = (a, b, v) => (owed[a + '|' + b] = (owed[a + '|' + b] || 0) + v);
    expenses.forEach((e) => { if (e.repay) add(e.repay, e.by, e.amt); else people.forEach((p) => p !== e.by && add(p, e.by, e.amt / 5)); });
    const owe = []; const seen = new Set();
    Object.keys(owed).forEach((k) => { const [a, b] = k.split('|'); const key = [a, b].sort().join('|'); if (seen.has(key)) return; seen.add(key);
      const net = (owed[a + '|' + b] || 0) - (owed[b + '|' + a] || 0); const amt = Math.abs(net) < 1 ? 0 : Math.ceil(Math.abs(net) - 1e-9);
      if (amt) owe.push(net > 0 ? { from: a, to: b, amt } : { from: b, to: a, amt }); });
    owe.sort((x, y) => people.indexOf(x.from) - people.indexOf(y.from) || people.indexOf(x.to) - people.indexOf(y.to));
    const net = {}; people.forEach((p) => (net[p] = 0)); owe.forEach((o) => { net[o.from] -= o.amt; net[o.to] += o.amt; });
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
            <div class="balances">${people.map((p) => `<div class="bal"><span>${p}</span><span class="amt ${net[p] > 0 ? 'pos' : net[p] < 0 ? 'neg' : 'muted'}">${net[p] > 0 ? `gets back ${aud(net[p], true)}` : net[p] < 0 ? `owes ${aud(-net[p], true)}` : 'settled'}</span></div>`).join('')}</div>
          </section>
          <section class="section">
            <div class="section-head"><h2 class="section-title">All expenses</h2><span class="section-meta">${expenses.length}</span></div>
            <div class="list">${expenses.map((e) => `<div class="exp ${e.repay ? 'repay' : ''}" tabindex="0"><span class="exp-title">${e.title}</span><span class="exp-amt">${aud(e.amt)}</span>
              <span class="exp-sub">${e.repay ? 'Repayment' : `Paid by ${e.by} · ${e.split}`} · ${e.date}</span></div>`).join('')}</div>
          </section>
        </div>
        <section class="section" style="margin-top:0">
          <div class="section-head"><h2 class="section-title">Who pays who</h2><span class="section-meta">Rounded up</span></div>
          <div class="ledger">${owe.map((o) => `<div class="owe"><span class="who">${o.from}<span class="arrow">→</span>${o.to}</span><span class="amt">${aud(o.amt, true)}</span><button class="btn" style="height:32px;padding:0 12px">Record</button></div>`).join('')}</div>
        </section>
      </div>`;
  }

  // ---------- Sheet (add plan) ----------
  function openSheet() {
    const kinds = ['flight', 'stay', 'activity', 'event', 'food', 'transport', 'other'];
    const label = { flight: 'Flight', stay: 'Accommodation', activity: 'Activity', event: 'Event', food: 'Food & drink', transport: 'Transport', other: 'Other' };
    $('#sheet-root').innerHTML = `
      <div class="backdrop" id="bd"><div class="sheet" role="dialog" aria-modal="true" aria-label="Add plan">
        <div class="sheet-head"><h2 class="sheet-title">Add plan</h2><button class="icon-btn" id="close" aria-label="Close">${icon('x')}</button></div>
        <div class="sheet-body">
          <div class="types" role="group" aria-label="Type">${kinds.map((k, i) => `<button type="button" class="type" aria-pressed="${i === 2}">${icon(k)}${label[k]}</button>`).join('')}</div>
          <label class="field"><span class="field-label">Title</span><input class="input" placeholder="What’s the plan" /></label>
          <div class="field" role="group" aria-label="Status"><span class="field-label">Status</span><div class="seg"><button aria-pressed="false" style="font-family:var(--sans)">Confirmed</button><button aria-pressed="true" style="font-family:var(--sans)">Tentative</button></div></div>
          <div class="row2"><label class="field"><span class="field-label">Day</span><input class="input" type="date" value="${TODAY}" /></label><label class="field"><span class="field-label">Start time</span><input class="input" type="time" /></label></div>
          <label class="field"><span class="field-label">Location</span><input class="input" placeholder="Place or area" /></label>
          <label class="field"><span class="field-label">Notes</span><input class="input" /><span class="hint">Visible on the share link</span></label>
          <div class="private"><span class="private-k">${icon('lock')}Travelling group only</span>
            <label class="field"><span class="field-label">Booking reference</span><input class="input" /></label>
            <label class="field"><span class="field-label">Private notes</span><input class="input" /></label></div>
        </div>
        <div class="sheet-foot"><span class="spacer"></span><button class="btn" id="cancel">Cancel</button><button class="btn btn-primary" id="save">Save</button></div>
      </div></div>`;
    const bd = $('#bd'); requestAnimationFrame(() => bd.classList.add('open'));
    const close = () => { bd.classList.remove('open'); setTimeout(() => ($('#sheet-root').innerHTML = ''), 200); };
    bd.addEventListener('click', (e) => { if (e.target === bd || e.target.closest('#close,#cancel,#save')) close(); });
    bd.querySelectorAll('.type').forEach((b) => b.addEventListener('click', () => bd.querySelectorAll('.type').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
    bd.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)))));
  }

  // ---------- Shell ----------
  const tabs = [['overview', 'Overview', 'home', overview], ['itinerary', 'Itinerary', 'calendar', itinerary], ['places', 'Places', 'pin', placesView], ['expenses', 'Expenses', 'wallet', expensesView]];
  let tab = (location.hash.slice(1) || 'overview');
  function render() {
    const t = tabs.find((x) => x[0] === tab) || tabs[0];
    const v = $('#view'); v.innerHTML = t[3](); v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    $('#tabbar').innerHTML = tabs.map(([id, l, ic]) => `<button data-tab="${id}" aria-current="${id === t[0]}">${icon(ic, 'lg')}<span>${l}</span></button>`).join('');
    $('#side-nav').innerHTML = tabs.map(([id, l, ic]) => `<button class="nav" data-tab="${id}" aria-current="${id === t[0]}">${icon(ic)}<span>${l}</span></button>`).join('');
  }
  document.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; history.replaceState(null, '', '#' + tab); render(); scrollTo(0, 0); return; }
    const f = e.target.closest('[data-filter]'); if (f) { placeFilter = f.dataset.filter; render(); return; }
    if (e.target.closest('a')) return;
    if (e.target.closest('button.status')) { const b = e.target.closest('button.status'); const c = b.classList.contains('confirmed'); b.className = 'status ' + (c ? 'tentative' : 'confirmed'); b.innerHTML = `<i></i>${c ? 'Tentative' : 'Confirmed'}`; return; }
    if (e.target.closest('[data-open="plan"]') && !e.target.closest('.plan-tools')) openSheet();
  });
  document.addEventListener('submit', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#bd')) $('#close').click(); if (e.key === 'Enter' && e.target.matches('.plan')) openSheet(); });
  window.addEventListener('hashchange', () => { tab = location.hash.slice(1) || 'overview'; render(); });
  $('#mark').innerHTML = icon('directions');
  $('#share-btn').innerHTML = `${icon('share')}<span class="share-label">Share</span>`;
  $('#settings-btn').innerHTML = icon('settings', 'lg');
  render();
})();
