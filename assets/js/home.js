/* =========================================================================
   TokenAsset — home.js : data-first homepage cockpit (vanilla JS)
   KPIs, asset intelligence table (search/filter/sort/presets), evidence-mix
   bars (documentation coverage — never a quality/risk score), real history
   charts, watchlist, market intelligence. No scores, no advice, no fake data.
   ========================================================================= */
(() => {
  "use strict";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const STATUS_LABEL = {
    "public-primary":"Public primary","public-secondary":"Public secondary",
    "official-gated":"Official gated","internal-lead":"Internal lead",
    "unverified":"Unverified","conflict":"Conflict"
  };
  const badge = (st) => `<span class="badge ${esc(st)}"><span class="dot"></span>${esc(STATUS_LABEL[st]||st)}</span>`;
  const miniBadge = (st, label) => `<span class="badge mini ${esc(st)}" title="${esc(STATUS_LABEL[st]||st)}${label?" — "+esc(label):""}"><span class="dot"></span>${esc(label||STATUS_LABEL[st]||st)}</span>`;

  // ---- freshness ----
  function freshness(dateStr){
    if(!dateStr) return {k:"manual", label:"Manual review"};
    const d = new Date(dateStr + "T00:00:00");
    if(isNaN(d)) return {k:"manual", label:"Manual review"};
    const days = Math.floor((Date.now() - d.getTime())/86400000);
    if(days <= 7)  return {k:"fresh", label:"Fresh", days};
    if(days <= 30) return {k:"watch", label:"Watch", days};
    return {k:"stale", label:"Stale", days};
  }
  const freshChip = (dateStr) => { const f=freshness(dateStr); return `<span class="fresh-chip ${f.k}" title="Checked ${esc(dateStr||"—")}">${f.label}</span>`; };
  const parseAum = (v) => { if(!v) return -1; const m=String(v).replace(/,/g,"").match(/([\d.]+)\s*([BMK]?)/i);
    if(!m) return -1; const u=(m[2]||"").toUpperCase(); return parseFloat(m[1])*(u==="B"?1e9:u==="M"?1e6:u==="K"?1e3:1); };

  let DATA = {};
  const state = { sortKey:"aum", sortDir:-1, q:"", chain:"all", structure:"all", access:"all", preset:"all" };

  async function boot(){
    try {
      const [a,c,s] = await Promise.all([
        fetch("data/assets.json").then(r=>r.json()),
        fetch("data/claims.json").then(r=>r.json()),
        fetch("data/sources.json").then(r=>r.json())
      ]);
      DATA = { assets:a, claims:c.claims, sources:s.sources };
    } catch(e){
      const el=$("#cockpit"); if(el) el.insertAdjacentHTML("afterbegin", `<p class="section-note">Open through a local web server (browsers block file:// fetch). See README.</p>`);
      console.error(e); return;
    }
    renderKpis(); buildFilters(); renderTable(); renderReliability(); renderChangeLog();
    bindTheme(); bindTable(); bindViewTracking();
    renderShareBar(); renderHistory(); renderWatchlist(); liveCheck();
  }

  /* ---------- real per-browser view tracking (never fabricated) ---------- */
  const VIEWS_KEY = "ta_views";
  const getViews = () => { try { return JSON.parse(localStorage.getItem(VIEWS_KEY)||"{}"); } catch(e){ return {}; } };
  function bindViewTracking(){
    document.addEventListener("click", e => {
      const a = e.target.closest('a[href*="teardown.html?asset="]');
      if(!a) return;
      const m = a.getAttribute("href").match(/asset=(\w+)/);
      if(!m) return;
      const v = getViews(); const k = m[1].toUpperCase();
      v[k] = (v[k]||0)+1;
      try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch(err){}
    });
  }

  /* ---------- 4-fund AUM share bar (real, sourced values) ---------- */
  function renderShareBar(){
    const el = $("#share-bar"); if(!el) return;
    const rows = DATA.assets.assets.map(a => ({ t:a.ticker, v:parseAum(a.tape?.aum?.value), d:a.tape?.aum?.date }))
      .filter(r=>r.v>0).sort((a,b)=>b.v-a.v);
    const tot = rows.reduce((s,r)=>s+r.v,0);
    const COLORS = ["var(--accent)","var(--accent-2)","var(--s-ps-fg)","var(--s-og-fg)"];
    el.innerHTML = `<div class="sb-bar" role="img" aria-label="Share of combined tracked-fund AUM">` +
      rows.map((r,i)=>`<span class="sb-seg" style="width:${(100*r.v/tot).toFixed(1)}%;background:${COLORS[i%4]}" title="${r.t} ${(100*r.v/tot).toFixed(1)}%"></span>`).join("") + `</div>
      <div class="sb-legend">` + rows.map((r,i)=>`<span><i style="background:${COLORS[i%4]}"></i>${r.t} ${(100*r.v/tot).toFixed(1)}%</span>`).join("") +
      `<span class="muted">of combined tracked AUM ($${(tot/1e9).toFixed(2)}B) · per-asset sources &amp; dates in the table above</span></div>`;
  }

  /* ---------- evidence profile (documentation coverage, NOT a score) ---------- */
  function evidenceProfile(assetId){
    const cs = DATA.claims.filter(c => c.asset===assetId && c.publicSafe!==false && c.status!=="official-gated");
    const n = cs.length || 1;
    const cnt = k => cs.filter(c=>c.status===k).length;
    const pp=cnt("public-primary"), ps=cnt("public-secondary"), cf=cnt("conflict"), uv=cnt("unverified")+cnt("internal-lead");
    return { pp, ps, cf, uv, total:cs.length,
      pctPP: Math.round(100*pp/n), pctPS: Math.round(100*ps/n), pctCF: Math.round(100*cf/n), pctUV: Math.round(100*uv/n),
      completeness: Math.round(100*(pp+ps)/n) };
  }
  const evBar = (ev) => `
    <div class="ev-wrap" title="Evidence mix — documentation coverage only, not a quality or risk score. Public-primary ${ev.pctPP}% · secondary ${ev.pctPS}% · conflict ${ev.pctCF}% · unverified ${ev.pctUV}%">
      <div class="ev-bar" role="img" aria-label="Documentation coverage: ${ev.pctPP}% public primary, ${ev.pctPS}% secondary, ${ev.pctCF}% conflict, ${ev.pctUV}% unverified">
        <span class="ev pp" style="width:${ev.pctPP}%"></span><span class="ev ps" style="width:${ev.pctPS}%"></span><span class="ev cf" style="width:${ev.pctCF}%"></span><span class="ev uv" style="width:${ev.pctUV}%"></span>
      </div>
      <span class="ev-num">${ev.pctPP}% primary · ${ev.pctUV}% open</span>
    </div>`;

  /* ---------- KPIs ---------- */
  function renderKpis(){
    const m = DATA.assets.market || {};
    const order = ["totalRWA","treasuryMMF","trackedAssets","publicCandidates","ownershipVerified"];
    $("#kpi-grid").innerHTML = order.filter(k=>m[k]).map(k => { const x=m[k];
      return `<div class="kpi"><div class="kpi-top">${badge(x.status)}${freshChip(x.date)}</div>
        <div class="kpi-val">${esc(x.value)}</div>
        <div class="kpi-lbl">${esc(x.label)}${x.sub?` <span class="kpi-sub">${esc(x.sub)}</span>`:""}</div>
        <div class="kpi-src">Source: ${esc(x.source||"—")} · ${esc(x.date||"—")}</div></div>`; }).join("");
    const refresh = DATA.assets.lastRefresh; const f = freshness(refresh);
    $("#refresh-line").innerHTML = `Last data refresh: <strong>${esc(refresh||"—")}</strong> <span class="fresh-chip ${f.k}">${f.label}</span>
      <span class="muted">· every figure carries a source, date, and public/private label · no simulated data</span>`;
  }

  /* ---------- filters & presets ---------- */
  function buildFilters(){
    const A = DATA.assets.assets;
    const chains = [...new Set(A.flatMap(a=>a.chains||[]))].sort();
    $("#f-chain").innerHTML = `<option value="all">All chains</option>` + chains.map(c=>`<option>${esc(c)}</option>`).join("");
    $("#f-structure").innerHTML = `<option value="all">All structures</option>
      <option value="40-act">'40-Act fund</option><option value="ucits">UCITS</option><option value="private">Private fund (3(c)(7))</option>`;
    $("#f-access").innerHTML = `<option value="all">All access</option><option value="retail">Retail-accessible</option><option value="institutional">Institutional / qualified</option>`;
  }
  const PRESETS = {
    all:      { label:"All assets", apply:()=>{ state.sortKey="aum"; state.sortDir=-1; } },
    largest:  { label:"Largest funds", apply:()=>{ state.sortKey="aum"; state.sortDir=-1; } },
    complete: { label:"Most complete documentation", apply:()=>{ state.sortKey="evidence"; state.sortDir=-1; } },
    updated:  { label:"Recently updated", apply:()=>{ state.sortKey="lastChecked"; state.sortDir=-1; } },
    review:   { label:"Under review / open items", apply:()=>{ state.sortKey="evidence"; state.sortDir=1; } },
    viewed:   { label:"Most viewed (your clicks)", apply:()=>{ state.sortKey="views"; state.sortDir=-1; } }
  };

  function haystack(a){
    const prof = a.profile||{};
    return [a.ticker,a.name,a.issuer,a.assetType,a.wrapper,a.navType,a.eligibility,(a.chains||[]).join(" "),
      a.whyItMatters, prof.custodian?.v, prof.transferAgent?.v, prof.auditor?.v, prof.standard?.v, prof.jurisdiction?.v,
      a.publicStatus].filter(Boolean).join(" ").toLowerCase();
  }

  function assetRows(){
    let rows = DATA.assets.assets.map(a => {
      const sm=a.summary||{}, tape=a.tape||{}, ev=evidenceProfile(a.id);
      return { id:a.id, ticker:a.ticker, name:a.name, issuer:a.issuer, why:a.whyItMatters||"",
        aum:tape.aum||{}, change:tape.change30d||{}, chains:(a.chains||[]).length,
        ownership:sm.ownership||{status:"unverified",label:"—"}, redemption:sm.redemption||{status:"unverified",label:"—"},
        contractMap:sm.contractMap||{status:"unverified",label:"—"}, lastChecked:sm.lastChecked||tape.aum?.date||"",
        ev, publicStatus:a.publicStatus, wrapper:(a.wrapper||"").toLowerCase(), eligibility:(a.eligibility||"").toLowerCase(),
        chainsArr:a.chains||[], hay:haystack(a) };
    });
    if(state.q) rows = rows.filter(r => r.hay.includes(state.q.toLowerCase()));
    if(state.chain!=="all") rows = rows.filter(r => r.chainsArr.includes(state.chain));
    if(state.structure!=="all") rows = rows.filter(r =>
      state.structure==="40-act" ? r.wrapper.includes("40-act") :
      state.structure==="ucits" ? r.wrapper.includes("ucits") : r.wrapper.includes("private"));
    if(state.access!=="all") rows = rows.filter(r =>
      state.access==="retail" ? /retail|\$1\b|€1,000/.test(r.eligibility) : /institutional|qualified/.test(r.eligibility));
    const key=state.sortKey, dir=state.sortDir, views=getViews();
    const val = r => key==="aum" ? parseAum(r.aum.value) : key==="chains" ? r.chains
      : key==="evidence" ? r.ev.completeness : key==="views" ? (views[r.id]||0)
      : key==="lastChecked" ? (r.lastChecked||"") : (r[key]||"").toString().toLowerCase();
    rows.sort((x,y)=>{ const a=val(x),b=val(y); return (a<b?-1:a>b?1:0)*dir; });
    return rows;
  }

  function renderTable(){
    const rows = assetRows().map(r => {
      const priv = r.publicStatus !== "public-safe";
      return `<tr>
        <td><a class="t-tic" href="teardown.html?asset=${esc(r.id.toLowerCase())}">${esc(r.ticker)}</a>
            ${priv?`<span class="pill-priv" title="Private-feedback draft — public page uses public sources only">private</span>`:""}
            <span class="t-name">${esc(r.name)}</span></td>
        <td>${esc(r.issuer)}<span class="t-why">${esc(r.why)}</span></td>
        <td><span class="t-aum">${esc(r.aum.value||"—")}</span> ${r.aum.status?miniBadge(r.aum.status):""}</td>
        <td>${r.change.value?`${esc(r.change.value)} ${miniBadge(r.change.status)}`:miniBadge("unverified")}</td>
        <td class="t-num">${r.chains}</td>
        <td>${miniBadge(r.ownership.status, r.ownership.label)}</td>
        <td>${miniBadge(r.redemption.status, r.redemption.label)}</td>
        <td>${miniBadge(r.contractMap.status, r.contractMap.label)}</td>
        <td>${esc(r.lastChecked||"—")}<br>${freshChip(r.lastChecked)}</td>
        <td>${evBar(r.ev)}</td>
        <td><a class="btn-sm" href="teardown.html?asset=${esc(r.id.toLowerCase())}">Open →</a>
            <a class="btn-sm" href="compare.html">Compare</a>
            ${(getViews()[r.id]||0)>0?`<span class="t-views" title="Opens from this browser only — not site-wide analytics">${getViews()[r.id]} view${getViews()[r.id]>1?"s":""} (you)</span>`:""}</td>
      </tr>`;
    }).join("");
    $("#asset-table tbody").innerHTML = rows || `<tr><td colspan="11" class="empty">No assets match the current filters.</td></tr>`;
    $$("#asset-table th[data-sort]").forEach(th=>{
      const k=th.getAttribute("data-sort");
      th.setAttribute("aria-sort", state.sortKey===k ? (state.sortDir===1?"ascending":"descending") : "none");
      th.querySelector(".ind")?.remove();
      if(state.sortKey===k){ const s=document.createElement("span"); s.className="ind"; s.textContent = state.sortDir===1?" ▲":" ▼"; th.appendChild(s); }
    });
    $$(".preset-chips .chip").forEach(c => c.classList.toggle("on", c.dataset.preset===state.preset));
  }

  /* ---------- watchlist (broader market; snapshot + LIVE in-browser refresh) ---------- */
  let WL = null;
  const fmtCap = v => v>=1e9?`$${(v/1e9).toFixed(1)}B`:v>=1e6?`$${(v/1e6).toFixed(0)}M`:`$${Math.round(v).toLocaleString()}`;
  const fmtPx = p => (p>=0.98&&p<=1.02)?`$${p.toFixed(4)}`:`$${p.toLocaleString(undefined,{maximumFractionDigits:2})}`;
  function sparkSvg(arr, id){
    if(!arr || arr.length<3) return `<span class="muted">—</span>`;
    const W=110,H=26,P=2;
    const mn=Math.min(...arr), mx=Math.max(...arr), rng=(mx-mn)||mx*0.001||1;
    const pts=arr.map((v,i)=>`${(P+(W-2*P)*i/(arr.length-1)).toFixed(1)},${(H-P-(H-2*P)*((v-mn)/rng)).toFixed(1)}`).join(" ");
    const up = arr[arr.length-1] >= arr[0];
    return `<svg class="spark ${up?"up":"dn"}" viewBox="0 0 ${W} ${H}" data-spark="${esc(id)}" role="img" aria-label="7-day trend"><polyline points="${pts}" fill="none"/></svg>`;
  }
  async function renderWatchlist(){
    try { WL = await fetch("data/watchlist.json").then(r=>r.json()); } catch(e){ return; }
    const el=$("#watchlist-table tbody"); if(!el) return;
    el.innerHTML = WL.items.map(c => `<tr data-wl="${esc(c.id)}">
      <td><span class="t-tic">${esc(c.symbol)}</span> <span class="t-name">${esc(c.name)}</span></td>
      <td class="t-num" data-cell="px">${fmtPx(c.price)}</td>
      <td class="t-num" data-cell="mc">${fmtCap(c.mcap)}</td>
      <td class="t-num" data-cell="ch">${c.chg30d==null?"—":(c.chg30d>=0?"+":"")+c.chg30d.toFixed(2)+"% (30d)"}</td>
      <td data-cell="spark">${sparkSvg(c.spark7d, c.id)}</td>
      <td>${miniBadge("public-secondary")}</td>
      <td data-cell="asof">${esc(WL.fetched)}<br>${freshChip(WL.fetched)}</td>
    </tr>`).join("");
    $("#watchlist-note").innerHTML = `Snapshot ${esc(WL.fetched)} from ${esc(WL.source)} (public-secondary) — <span id="wl-live-status">attempting live refresh…</span> Watchlist assets are monitored for coverage expansion; full teardowns not yet published.`;
    refreshWatchlistLive();
  }
  async function refreshWatchlistLive(){
    const status = $("#wl-live-status");
    try {
      const ids = (WL.liveIds||WL.items.map(i=>i.id)).join(",");
      const m = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=30d&sparkline=true`,
                            {signal: AbortSignal.timeout(9000)}).then(r=>r.json());
      const hhmm = new Date().toTimeString().slice(0,5);
      m.forEach(c => {
        const tr = document.querySelector(`tr[data-wl="${c.id}"]`); if(!tr) return;
        tr.querySelector('[data-cell="px"]').textContent = fmtPx(c.current_price);
        tr.querySelector('[data-cell="mc"]').textContent = fmtCap(c.market_cap);
        const ch = c.price_change_percentage_30d_in_currency;
        tr.querySelector('[data-cell="ch"]').textContent = ch==null?"—":(ch>=0?"+":"")+ch.toFixed(2)+"% (30d)";
        const spark=(c.sparkline_in_7d?.price||[]).filter((_,i)=>i%6===0);
        if(spark.length>2) tr.querySelector('[data-cell="spark"]').innerHTML = sparkSvg(spark, c.id);
        tr.querySelector('[data-cell="asof"]').innerHTML = `<span class="live-chip">● live ${hhmm}</span>`;
      });
      if(status) status.innerHTML = `<span class="live-chip">● LIVE</span> refreshed in-browser at ${hhmm} from CoinGecko (real market data — never simulated).`;
      renderTape(m, hhmm);
    } catch(e){
      if(status) status.textContent = `live refresh unavailable — showing the dated snapshot (never simulated).`;
      renderTape(null, null);
    }
  }

  /* ---------- market tape (TradingView-style strip; real values only) ---------- */
  function renderTape(live, hhmm){
    const el = $("#market-tape"); if(!el || !WL) return;
    const src = live ? live.map(c=>({s:c.symbol.toUpperCase(), p:c.current_price, m:c.market_cap}))
                     : WL.items.map(c=>({s:c.symbol, p:c.price, m:c.mcap}));
    const chip = c => `<span class="tape-item"><b>${esc(c.s)}</b> ${fmtPx(c.p)} <span class="muted">${fmtCap(c.m)}</span></span>`;
    const lbl = live ? `<span class="tape-item tape-label"><span class="live-chip">● live ${esc(hhmm)}</span></span>`
                     : `<span class="tape-item tape-label"><span class="muted">snapshot ${esc(WL.fetched)}</span></span>`;
    const seq = lbl + src.map(chip).join("");
    el.innerHTML = `<div class="tape-track">${seq}${seq}</div>`; // duplicated for seamless loop
    el.hidden = false;
  }

  /* ---------- reliability + intelligence ---------- */
  function renderReliability(){
    const s = DATA.sources; const by = t => s.filter(x=>x.type===t).length;
    const priv = s.filter(x=>x.publicStatus==="private").length;
    $("#reliability-counts").innerHTML = [
      ["Public primary", by("public-primary"), "public-primary"],
      ["Public secondary", by("public-secondary"), "public-secondary"],
      ["Official gated / private", priv, "official-gated"],
      ["Total sources tracked", s.length, null]
    ].map(([l,n,st]) => `<div class="rc"><span class="rc-n">${n}</span><span class="rc-l">${st?badge(st):""}${esc(l)}</span></div>`).join("");
    const cad = DATA.assets.cadence;
    if(cad) $("#cadence-line").innerHTML = `<strong>Update cadence:</strong> ${esc(cad.note)} <span class="muted">(Automated monitor: ${esc(cad.monitor)}.)</span>`;
  }

  function renderChangeLog(){
    const cl = DATA.assets.changeLog || [];
    $("#changelog").innerHTML = cl.map(e => `<div class="cl-row">
      <div class="cl-meta"><span class="cl-date">${esc(e.date)}</span> ${badge(e.evidence)} <span class="cl-asset">${esc(e.asset)}</span></div>
      <div class="cl-change">${esc(e.change)}</div>
      <div class="cl-foot"><span class="cl-src">Source: ${esc(e.source)}</span><span class="cl-rev ${/flag/i.test(e.reviewer)?"flag":"ok"}">${esc(e.reviewer)}</span></div>
    </div>`).join("");
  }

  /* ---------- events ---------- */
  function bindTable(){
    $("#table-search").addEventListener("input", e => { state.q=e.target.value; renderTable(); });
    [["#f-chain","chain"],["#f-structure","structure"],["#f-access","access"]].forEach(([sel,key])=>{
      $(sel)?.addEventListener("change", e => { state[key]=e.target.value; renderTable(); });
    });
    $$(".preset-chips .chip").forEach(c => c.addEventListener("click", ()=>{
      state.preset=c.dataset.preset; (PRESETS[state.preset]||PRESETS.all).apply(); renderTable();
    }));
    $$("#asset-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => { const k=th.getAttribute("data-sort");
        if(state.sortKey===k) state.sortDir*=-1; else { state.sortKey=k; state.sortDir=(k==="aum"||k==="chains"||k==="evidence")?-1:1; }
        state.preset="custom"; renderTable(); });
      th.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); th.click(); } });
    });
  }
  function bindTheme(){
    const btn=$("#theme-toggle"); if(!btn) return;
    btn.addEventListener("click", () => {
      const dark=document.documentElement.getAttribute("data-theme")==="dark";
      document.documentElement.setAttribute("data-theme", dark?"light":"dark");
      btn.setAttribute("aria-pressed", String(!dark)); btn.textContent = dark?"Dark":"Light";
    });
  }

  /* ---------- history charts (real series; scrub to read) ---------- */
  const fmtUsd = v => v>=1e9 ? `$${(v/1e9).toFixed(2)}B` : v>=1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`;
  const fmtDate = t => new Date(t).toISOString().slice(0,10);
  async function renderHistory(){
    let hist; try { hist = await fetch("data/history.json").then(r=>r.json()); } catch(e){ return; }
    const wrap = $("#history-grid"); if(!wrap) return;
    const order = ["BUIDL","BENJI","EUTBL","WTGXX"];
    wrap.innerHTML = order.filter(k=>hist.series[k]).map(k => {
      const s=hist.series[k], pts=s.points, n=pts.length;
      const delta = 100*(pts[n-1].v-pts[0].v)/pts[0].v;
      const range = `${fmtDate(pts[0].t)} → ${fmtDate(pts[n-1].t)}`;
      return `<div class="chart-card" data-series="${esc(k)}">
        <div class="ch-head"><div><span class="ch-tic">${esc(k)}</span><span class="ch-lbl">${esc(s.label)}</span></div>
          <div class="ch-right">${badge(s.status)}<span class="live-slot" id="live-${esc(k)}"></span></div></div>
        <div class="ch-now"><span class="ch-val" id="chval-${esc(k)}">${fmtUsd(pts[n-1].v)}</span>
          <span class="ch-date" id="chdate-${esc(k)}">${fmtDate(pts[n-1].t)}</span>
          <span class="ch-delta">${delta>=0?"+":""}${delta.toFixed(1)}% over period</span></div>
        <svg class="ch-svg" viewBox="0 0 600 180" preserveAspectRatio="none" role="img"
             aria-label="${esc(k)} history ${esc(range)}"></svg>
        <div class="ch-foot"><span>${esc(range)}</span><span class="ch-src">${esc(s.source)}</span></div>
      </div>`;
    }).join("");
    order.filter(k=>hist.series[k]).forEach(k => drawChart(k, hist.series[k]));
  }
  function drawChart(key, s){
    const card = document.querySelector(`.chart-card[data-series="${key}"]`);
    const svg = card.querySelector("svg");
    const pts=s.points, n=pts.length, W=600,H=180,P=8;
    const vmin=Math.min(...pts.map(p=>p.v)), vmax=Math.max(...pts.map(p=>p.v));
    const pad=(vmax-vmin)*0.08 || vmax*0.05;
    const y=v=>H-P-(H-2*P)*((v-(vmin-pad))/((vmax+pad)-(vmin-pad)));
    const x=i=>P+(W-2*P)*(i/(n-1));
    const line=pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    svg.innerHTML = `<path d="${line} L${x(n-1)},${H} L${x(0)},${H} Z" class="ch-area"/>
      <path d="${line}" class="ch-line" fill="none"/>
      <line class="ch-cross" x1="0" x2="0" y1="0" y2="${H}" style="display:none"/>
      <circle class="ch-dot" r="4" style="display:none"/>`;
    const cross=svg.querySelector(".ch-cross"), dot=svg.querySelector(".ch-dot");
    const valEl=card.querySelector(`#chval-${key}`), dateEl=card.querySelector(`#chdate-${key}`);
    const base={ v:fmtUsd(pts[n-1].v), d:fmtDate(pts[n-1].t) };
    function scrub(cx){
      const r=svg.getBoundingClientRect();
      const i=Math.max(0,Math.min(n-1,Math.round((cx-r.left)/r.width*(n-1))));
      cross.style.display=dot.style.display="";
      cross.setAttribute("x1",x(i)); cross.setAttribute("x2",x(i));
      dot.setAttribute("cx",x(i)); dot.setAttribute("cy",y(pts[i].v));
      valEl.textContent = fmtUsd(pts[i].v)+(pts[i].y!=null?` · ${pts[i].y.toFixed(2)}% 7d`:"");
      dateEl.textContent = fmtDate(pts[i].t);
    }
    function reset(){ cross.style.display=dot.style.display="none"; valEl.textContent=base.v; dateEl.textContent=base.d; }
    svg.addEventListener("mousemove", e=>scrub(e.clientX));
    svg.addEventListener("mouseleave", reset);
    svg.addEventListener("touchmove", e=>{ if(e.touches[0]) scrub(e.touches[0].clientX); }, {passive:true});
    svg.addEventListener("touchend", reset);
  }

  /* ---------- live market check (REAL data, timestamped; never simulated) ---------- */
  async function liveCheck(){
    const ids = { "blackrock-usd-institutional-digital-liquidity-fund":"BUIDL", "eutbl":"EUTBL" };
    try {
      const q = Object.keys(ids).join(",");
      const d = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${q}&vs_currencies=usd&include_market_cap=true`,
                            {signal: AbortSignal.timeout(8000)}).then(r=>r.json());
      const hhmm = new Date().toTimeString().slice(0,5);
      Object.entries(ids).forEach(([id,k])=>{
        const slot=document.getElementById(`live-${k}`); const cap=d[id]?.usd_market_cap;
        if(slot && cap) slot.innerHTML = `<span class="live-chip" title="Fetched live from CoinGecko (public-secondary) at ${hhmm} — real market data, not simulated">● live ${fmtUsd(cap)} · ${hhmm}</span>`;
      });
    } catch(e){ /* offline: dated snapshots remain — never simulate */ }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
