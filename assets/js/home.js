/* =========================================================================
   TokenAsset — home.js : data-first homepage cockpit (vanilla JS)
   Renders KPIs, the asset intelligence table, freshness, change log, and
   reliability counts from data/*.json. No scores, no advice, no fake live data.
   Freshness is computed from each fact's dateChecked vs. the current date —
   so stale data visibly ages instead of masquerading as current.
   ========================================================================= */
(() => {
  "use strict";
  const $ = (s, r=document) => r.querySelector(s);
  const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const STATUS_LABEL = {
    "public-primary":"Public primary","public-secondary":"Public secondary",
    "official-gated":"Official gated","internal-lead":"Internal lead",
    "unverified":"Unverified","conflict":"Conflict"
  };
  const badge = (st) => `<span class="badge ${esc(st)}"><span class="dot"></span>${esc(STATUS_LABEL[st]||st)}</span>`;

  // ---- freshness (computed from dateChecked vs today) ----
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
  const parseAum = (v) => { // rough numeric sort key from strings like "$2.2486B" / "~$764.3M"
    if(!v) return -1; const m = String(v).replace(/,/g,"").match(/([\d.]+)\s*([BMK]?)/i);
    if(!m) return -1; let n=parseFloat(m[1]); const u=(m[2]||"").toUpperCase();
    return n * (u==="B"?1e9:u==="M"?1e6:u==="K"?1e3:1);
  };

  let DATA = {};
  const state = { sortKey:"aum", sortDir:-1, q:"" };

  async function boot(){
    try {
      const [a,c,s] = await Promise.all([
        fetch("data/assets.json").then(r=>r.json()),
        fetch("data/claims.json").then(r=>r.json()),
        fetch("data/sources.json").then(r=>r.json())
      ]);
      DATA = { assets:a, claims:c.claims, sources:s.sources };
    } catch(e){
      const el=$("#cockpit"); if(el) el.innerHTML = `<p class="section-note">Open through a local web server (browsers block file:// fetch). See README.</p>`;
      console.error(e); return;
    }
    renderKpis();
    renderTable();
    renderReliability();
    renderChangeLog();
    bindTheme();
    bindTable();
    renderHistory();   // real historical series (SEC N-MFP / CoinGecko) — no simulation
    liveCheck();       // real live market data fetched client-side, timestamped + labeled
  }

  /* ---------- history charts (real data, scrub to read values) ---------- */
  const fmtUsd = v => v>=1e9 ? `$${(v/1e9).toFixed(2)}B` : v>=1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${Math.round(v).toLocaleString()}`;
  const fmtDate = t => new Date(t).toISOString().slice(0,10);

  async function renderHistory(){
    let hist;
    try { hist = await fetch("data/history.json").then(r=>r.json()); } catch(e){ return; }
    const wrap = $("#history-grid"); if(!wrap) return;
    const order = ["BUIDL","BENJI","EUTBL","WTGXX"];
    wrap.innerHTML = order.filter(k=>hist.series[k]).map(k => {
      const s = hist.series[k];
      const pts = s.points; const n = pts.length;
      const first = pts[0].v, last = pts[n-1].v;
      const delta = 100*(last-first)/first;
      const range = `${fmtDate(pts[0].t)} → ${fmtDate(pts[n-1].t)}`;
      return `<div class="chart-card" data-series="${esc(k)}">
        <div class="ch-head">
          <div><span class="ch-tic">${esc(k)}</span><span class="ch-lbl">${esc(s.label)}</span></div>
          <div class="ch-right">${badge(s.status)}<span class="live-slot" id="live-${esc(k)}"></span></div>
        </div>
        <div class="ch-now"><span class="ch-val" id="chval-${esc(k)}">${fmtUsd(last)}</span>
          <span class="ch-date" id="chdate-${esc(k)}">${fmtDate(pts[n-1].t)}</span>
          <span class="ch-delta">${delta>=0?"+":""}${delta.toFixed(1)}% over period</span></div>
        <svg class="ch-svg" viewBox="0 0 600 180" preserveAspectRatio="none" role="img"
             aria-label="${esc(k)} history ${esc(range)}: ${fmtUsd(first)} to ${fmtUsd(last)}"></svg>
        <div class="ch-foot"><span>${esc(range)}</span><span class="ch-src">${esc(s.source)}</span></div>
      </div>`;
    }).join("");
    order.filter(k=>hist.series[k]).forEach(k => drawChart(k, hist.series[k]));
  }

  function drawChart(key, s){
    const card = document.querySelector(`.chart-card[data-series="${key}"]`);
    const svg = card.querySelector("svg");
    const pts = s.points, n = pts.length;
    const W=600,H=180,P=8;
    const vmin = Math.min(...pts.map(p=>p.v)), vmax = Math.max(...pts.map(p=>p.v));
    const pad = (vmax-vmin)*0.08 || vmax*0.05;
    const y = v => H-P - (H-2*P)*((v-(vmin-pad))/((vmax+pad)-(vmin-pad)));
    const x = i => P + (W-2*P)*(i/(n-1));
    const line = pts.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    svg.innerHTML = `
      <path d="${line} L${x(n-1)},${H} L${x(0)},${H} Z" class="ch-area"/>
      <path d="${line}" class="ch-line" fill="none"/>
      <line class="ch-cross" x1="0" x2="0" y1="0" y2="${H}" style="display:none"/>
      <circle class="ch-dot" r="4" style="display:none"/>`;
    const cross = svg.querySelector(".ch-cross"), dot = svg.querySelector(".ch-dot");
    const valEl = card.querySelector(`#chval-${key}`), dateEl = card.querySelector(`#chdate-${key}`);
    const base = { v: fmtUsd(pts[n-1].v), d: fmtDate(pts[n-1].t) };
    function scrub(clientX){
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n-1, Math.round((clientX-r.left)/r.width*(n-1))));
      cross.style.display = dot.style.display = "";
      cross.setAttribute("x1",x(i)); cross.setAttribute("x2",x(i));
      dot.setAttribute("cx",x(i)); dot.setAttribute("cy",y(pts[i].v));
      valEl.textContent = fmtUsd(pts[i].v) + (pts[i].y!=null?` · ${pts[i].y.toFixed(2)}% 7d`:"" );
      dateEl.textContent = fmtDate(pts[i].t);
    }
    function reset(){ cross.style.display=dot.style.display="none"; valEl.textContent=base.v; dateEl.textContent=base.d; }
    svg.addEventListener("mousemove", e=>scrub(e.clientX));
    svg.addEventListener("mouseleave", reset);
    svg.addEventListener("touchmove", e=>{ if(e.touches[0]) scrub(e.touches[0].clientX); }, {passive:true});
    svg.addEventListener("touchend", reset);
  }

  /* ---------- live market check (REAL data, clearly timestamped; never simulated) ---------- */
  async function liveCheck(){
    const ids = { "blackrock-usd-institutional-digital-liquidity-fund":"BUIDL", "eutbl":"EUTBL" };
    try {
      const q = Object.keys(ids).join(",");
      const d = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${q}&vs_currencies=usd&include_market_cap=true`,
                            {signal: AbortSignal.timeout(8000)}).then(r=>r.json());
      const now = new Date();
      const hhmm = now.toTimeString().slice(0,5);
      Object.entries(ids).forEach(([id,k])=>{
        const slot = document.getElementById(`live-${k}`);
        const cap = d[id]?.usd_market_cap;
        if(slot && cap){ slot.innerHTML = `<span class="live-chip" title="Fetched live from CoinGecko (public-secondary) at ${hhmm} — real market data, not simulated">● live ${fmtUsd(cap)} · ${hhmm}</span>`; }
      });
    } catch(e){ /* offline / blocked: dated snapshots remain — never simulate */ }
  }

  const evidenceProfile = (assetId) => {
    const cs = DATA.claims.filter(c => c.asset===assetId && c.publicSafe!==false && c.status!=="official-gated");
    const counts={}; cs.forEach(c => counts[c.status]=(counts[c.status]||0)+1);
    const order=["public-primary","public-secondary","conflict","internal-lead","unverified"];
    let best="public-secondary", bestN=-1;
    order.forEach(k => { if((counts[k]||0)>bestN){best=k;bestN=counts[k]||0;} });
    return { best, pp:(counts["public-primary"]||0), total:cs.length };
  };

  function renderKpis(){
    const m = DATA.assets.market || {};
    const order = ["totalRWA","treasuryMMF","trackedAssets","publicCandidates","ownershipVerified"];
    const cards = order.filter(k=>m[k]).map(k => {
      const x = m[k];
      return `<div class="kpi">
        <div class="kpi-top">${badge(x.status)}${freshChip(x.date)}</div>
        <div class="kpi-val">${esc(x.value)}</div>
        <div class="kpi-lbl">${esc(x.label)}${x.sub?` <span class="kpi-sub">${esc(x.sub)}</span>`:""}</div>
        <div class="kpi-src">Source: ${esc(x.source||"—")} · ${esc(x.date||"—")}</div>
      </div>`;
    }).join("");
    const refresh = DATA.assets.lastRefresh;
    const f = freshness(refresh);
    $("#kpi-grid").innerHTML = cards;
    $("#refresh-line").innerHTML = `Last data refresh: <strong>${esc(refresh||"—")}</strong> <span class="fresh-chip ${f.k}">${f.label}</span>
      <span class="muted">· figures carry a source, date, and public/private label · no live price simulation</span>`;
  }

  function assetRows(){
    let rows = DATA.assets.assets.map(a => {
      const sm = a.summary || {};
      const tape = a.tape || {};
      const ev = evidenceProfile(a.id);
      return {
        id:a.id, ticker:a.ticker, name:a.name, issuer:a.issuer,
        aum: tape.aum || {}, change: tape.change30d || {},
        chains: (a.chains||[]).length,
        ownership: sm.ownership || {status:"unverified",label:"—"},
        redemption: sm.redemption || {status:"unverified",label:"—"},
        contractMap: sm.contractMap || {status:"unverified",label:"—"},
        lastChecked: sm.lastChecked || tape.aum?.date || "",
        ev, publicStatus:a.publicStatus
      };
    });
    if(state.q){ const q=state.q.toLowerCase();
      rows = rows.filter(r => `${r.ticker} ${r.name} ${r.issuer}`.toLowerCase().includes(q)); }
    const key = state.sortKey, dir = state.sortDir;
    const val = r => key==="aum" ? parseAum(r.aum.value) : key==="chains" ? r.chains
      : key==="lastChecked" ? (r.lastChecked||"") : (r[key]||"").toString().toLowerCase();
    rows.sort((x,y)=>{ const a=val(x),b=val(y); return (a<b?-1:a>b?1:0)*dir; });
    return rows;
  }

  function renderTable(){
    const rows = assetRows().map(r => {
      const priv = r.publicStatus !== "public-safe";
      return `<tr>
        <td><a class="t-tic" href="teardown.html?asset=${esc(r.id.toLowerCase())}">${esc(r.ticker)}</a>
            ${priv?`<span class="pill-priv" title="Private-feedback draft — public page uses public sources only">private</span>`:""}</td>
        <td>${esc(r.issuer)}</td>
        <td><span class="t-aum">${esc(r.aum.value||"—")}</span> ${r.aum.status?badge(r.aum.status):""}</td>
        <td>${esc(r.change.value||"—")}</td>
        <td class="t-num">${r.chains}</td>
        <td>${badge(r.ownership.status)} <span class="t-lbl">${esc(r.ownership.label)}</span></td>
        <td>${badge(r.redemption.status)} <span class="t-lbl">${esc(r.redemption.label)}</span></td>
        <td>${badge(r.contractMap.status)} <span class="t-lbl">${esc(r.contractMap.label)}</span></td>
        <td>${esc(r.lastChecked||"—")}<br>${freshChip(r.lastChecked)}</td>
        <td>${badge(r.ev.best)}<br><span class="t-lbl">${r.ev.pp}/${r.ev.total} public-primary</span></td>
        <td><a class="btn-sm" href="teardown.html?asset=${esc(r.id.toLowerCase())}">Open →</a></td>
      </tr>`;
    }).join("");
    $("#asset-table tbody").innerHTML = rows;
    // header sort indicators
    document.querySelectorAll("#asset-table th[data-sort]").forEach(th=>{
      const k=th.getAttribute("data-sort");
      th.setAttribute("aria-sort", state.sortKey===k ? (state.sortDir===1?"ascending":"descending") : "none");
      th.querySelector(".ind")?.remove();
      if(state.sortKey===k){ const s=document.createElement("span"); s.className="ind"; s.textContent = state.sortDir===1?" ▲":" ▼"; th.appendChild(s); }
    });
  }

  function renderReliability(){
    const s = DATA.sources;
    const by = t => s.filter(x=>x.type===t).length;
    const priv = s.filter(x=>x.publicStatus==="private").length;
    $("#reliability-counts").innerHTML = [
      ["Public primary", by("public-primary"), "public-primary"],
      ["Public secondary", by("public-secondary"), "public-secondary"],
      ["Official gated / private", priv, "official-gated"],
      ["Total sources tracked", s.length, null]
    ].map(([l,n,st]) => `<div class="rc"><span class="rc-n">${n}</span><span class="rc-l">${st?badge(st):""}${esc(l)}</span></div>`).join("");
  }

  function renderChangeLog(){
    const cl = DATA.assets.changeLog || [];
    $("#changelog").innerHTML = cl.map(e => `<div class="cl-row">
      <div class="cl-meta"><span class="cl-date">${esc(e.date)}</span> ${badge(e.evidence)} <span class="cl-asset">${esc(e.asset)}</span></div>
      <div class="cl-change">${esc(e.change)}</div>
      <div class="cl-foot"><span class="cl-src">Source: ${esc(e.source)}</span><span class="cl-rev ${/flag/i.test(e.reviewer)?"flag":"ok"}">${esc(e.reviewer)}</span></div>
    </div>`).join("");
  }

  function bindTable(){
    $("#table-search").addEventListener("input", e => { state.q = e.target.value; renderTable(); });
    document.querySelectorAll("#asset-table th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-sort");
        if(state.sortKey===k) state.sortDir *= -1; else { state.sortKey=k; state.sortDir = (k==="aum"||k==="chains") ? -1 : 1; }
        renderTable();
      });
      th.addEventListener("keydown", e => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); th.click(); } });
    });
  }
  function bindTheme(){
    const btn=$("#theme-toggle"); if(!btn) return;
    btn.addEventListener("click", () => {
      const dark = document.documentElement.getAttribute("data-theme")==="dark";
      document.documentElement.setAttribute("data-theme", dark?"light":"dark");
      btn.setAttribute("aria-pressed", String(!dark)); btn.textContent = dark?"Dark":"Light";
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
