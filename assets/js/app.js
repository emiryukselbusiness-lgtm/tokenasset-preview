/* =========================================================================
   TokenAsset Teardown — app.js (vanilla JS, no dependencies)
   Renders the teardown from data/*.json. Enforces public/private separation
   in the UI. No scores, ratings, or advice are ever generated here.
   ========================================================================= */
(() => {
  "use strict";

  const STATUS_LABEL = {
    "public-primary": "Public primary",
    "public-secondary": "Public secondary",
    "official-gated": "Official gated / account-source",
    "internal-lead": "Internal lead",
    "unverified": "Unverified",
    "conflict": "Conflict"
  };
  const SECTION_NAV = [
    ["overview","Overview"],["tape","Asset tape"],["snapshot","Snapshot"],["core","Core question"],
    ["explore","Search & filter"],["facts","Verified facts"],["gated","Private evidence"],
    ["missing","Open items"],["ownership","Ownership"],["redemption","Redemption"],["custody","Custody"],
    ["contracts","Contracts"],["quality","Source quality"],["questions","Reviewer Qs"],
    ["appendix","Appendix"],["feedback","Feedback"],["answers","Quick answers"]
  ];

  const state = { assets:null, claims:null, sources:null, current:null, publicSafe:false, unverifiedOnly:false,
                  search:"", evidence:"all", chain:"all", sourceSearch:"" };

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const srcById = (id) => (state.sources.sources.find(s => s.id === id) || null);

  function badge(status){
    return `<span class="badge ${esc(status)}"><span class="dot"></span>${esc(STATUS_LABEL[status]||status)}</span>`;
  }
  function toast(msg){
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.remove("show"), 1600);
  }
  // public-safe gate: a claim/source is shown only if not gated/private when publicSafe on
  const claimVisibleByMode = (c) => !state.publicSafe || (c.publicSafe !== false && c.status !== "official-gated");

  /* ---------- boot ---------- */
  async function boot(){
    try {
      // Single-file build: data is embedded on window.__RWA_DATA__ (no fetch needed).
      if (window.__RWA_DATA__) {
        state.assets = window.__RWA_DATA__.assets;
        state.claims = window.__RWA_DATA__.claims;
        state.sources = window.__RWA_DATA__.sources;
      } else {
        const [a,c,s] = await Promise.all([
          fetch("data/assets.json").then(r=>r.json()),
          fetch("data/claims.json").then(r=>r.json()),
          fetch("data/sources.json").then(r=>r.json())
        ]);
        state.assets=a; state.claims=c; state.sources=s;
      }
    } catch(err){
      $("#main").innerHTML = `<section class="card"><h2>Could not load data</h2>
        <p class="section-note">Open this site through a local web server (browsers block <code>fetch</code> of local files via <code>file://</code>). See README.md — e.g. <code>python3 -m http.server</code> in this folder, then visit the served URL.</p></section>`;
      console.error(err); return;
    }
    // Initial asset: ?asset= URL param (case-insensitive) → else first asset.
    const wanted = new URLSearchParams(location.search).get("asset");
    const match = wanted && state.assets.assets.find(a => a.id.toLowerCase() === wanted.toLowerCase());
    state.current = match ? match.id : state.assets.assets[0].id;
    buildChrome();
    bindEvents();
    render();
    setupScrollSpy();
  }

  // Reflect the selected asset in the URL + per-page meta so each teardown is a stable, shareable link.
  function syncUrlAndMeta(){
    const a = asset();
    const title = `${a.ticker} — ${a.name} · TokenAsset Teardown`;
    document.title = title;
    const url = `${location.pathname}?asset=${a.id.toLowerCase()}`;
    try { history.replaceState(null, "", url); } catch(e){ /* file:// */ }
    const set = (id, attr, val) => { const el = document.getElementById(id); if(el) el.setAttribute(attr, val); };
    set("canonical-link","href", `https://example.com/rwa-teardown/teardown.html?asset=${a.id.toLowerCase()}`);
    set("og-title","content", title);
    set("tw-title","content", title);
    set("og-url","content", `https://example.com/rwa-teardown/teardown.html?asset=${a.id.toLowerCase()}`);
  }

  function buildChrome(){
    // asset select
    $("#asset-select").innerHTML = state.assets.assets
      .map(a => `<option value="${esc(a.id)}">${esc(a.ticker)} — ${esc(a.name)}</option>`).join("");
    // rail
    $("#rail-list").innerHTML = SECTION_NAV.map(([id,label]) =>
      `<li><a href="#${id}" data-nav="${id}">${esc(label)}</a></li>`).join("");
    // legend
    $("#legend-list").innerHTML = Object.keys(STATUS_LABEL)
      .map(k => `<li>${badge(k)}</li>`).join("");
    // footer + ld-json
    $("#footer-disclaimer").textContent = state.assets.disclaimer;
    writeLdJson();
  }

  function bindEvents(){
    $("#asset-select").addEventListener("change", e => { state.current = e.target.value; render(); });
    $("#theme-toggle").addEventListener("click", e => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      document.documentElement.setAttribute("data-theme", dark ? "light":"dark");
      e.currentTarget.setAttribute("aria-pressed", String(!dark));
      e.currentTarget.textContent = dark ? "Dark":"Light";
    });
    $("#public-safe-toggle").addEventListener("click", e => {
      state.publicSafe = !state.publicSafe;
      document.body.classList.toggle("public-safe", state.publicSafe);
      e.currentTarget.setAttribute("aria-pressed", String(state.publicSafe));
      toast(state.publicSafe ? "Public-safe mode on — private evidence hidden" : "Public-safe mode off");
      render();
    });
    $("#unverified-toggle").addEventListener("click", e => {
      state.unverifiedOnly = !state.unverifiedOnly;
      e.currentTarget.setAttribute("aria-pressed", String(state.unverifiedOnly));
      render();
    });
    $("#print-btn").addEventListener("click", () => window.print());
    $("#claim-search").addEventListener("input", e => { state.search = e.target.value.toLowerCase(); renderClaimSections(); });
    $("#evidence-filter").addEventListener("change", e => { state.evidence = e.target.value; renderClaimSections(); });
    $("#chain-filter").addEventListener("change", e => { state.chain = e.target.value; renderContracts(); });
    $("#source-search").addEventListener("input", e => { state.sourceSearch = e.target.value.toLowerCase(); renderAppendix(); });

    // delegated copy buttons
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-copy]");
      if(!b) return;
      navigator.clipboard?.writeText(b.getAttribute("data-copy")).then(()=>toast("Copied")).catch(()=>toast("Copy failed"));
    });
  }

  const asset = () => state.assets.assets.find(a => a.id === state.current);
  const claimsForAsset = () => state.claims.claims.filter(c => c.asset === state.current);

  /* ---------- render ---------- */
  function render(){
    const a = asset();
    syncUrlAndMeta();
    // alert band
    const isPrivate = a.publicStatus !== "public-safe";
    $("#alert-status").textContent = isPrivate ? "Private feedback draft" : "Public-safe research draft";
    // hero
    $("#overview-h").textContent = `${a.name} (${a.ticker})`;
    $("#overview-lede").textContent = a.statusNote;
    $("#hero-meta").innerHTML = [
      ["Issuer / manager", a.issuer],["Asset type", a.assetType],["Wrapper", a.wrapper],
      ["NAV", a.navType],["Investor eligibility", a.eligibility],["Chains", a.chains.join(", ")],
      ["Public / private status", isPrivate ? "Private feedback" : "Public-safe"],
      ["Authoritative record", `${a.ownershipRecord.answer}`],
      ["Last reviewed", (a.summary && a.summary.lastChecked) || "—"]
    ].map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");

    renderTape();
    renderSnapshot();
    renderCore();
    renderClaimSections();
    renderMissing();
    renderContracts();
    renderQuality();
    renderQuestions();
    renderAppendix();
    renderAnswers();
    // sync asset select (in case of programmatic change)
    $("#asset-select").value = state.current;
  }

  function tapeMetric(label, m){
    if(!m) return "";
    const safe = !state.publicSafe || (m.publicSafe !== false && m.status !== "official-gated");
    const val = safe ? m.value : "Hidden in public-safe mode";
    return `<div class="tape-row"><span class="k">${esc(label)}</span><span class="v">${esc(val)}</span></div>`;
  }
  function renderTape(){
    $("#tape-strip").innerHTML = state.assets.assets.map(a => {
      const t = a.tape || {};
      const active = a.id === state.current ? " is-active":"";
      const st = a.tape?.aum?.status || "unverified";
      return `<button class="tape-card${active}" role="listitem" data-tape="${esc(a.id)}" aria-label="View ${esc(a.ticker)}">
        <div class="tape-tic">${esc(a.ticker)}</div>
        <div class="tape-name">${esc(a.name)}</div>
        ${tapeMetric("AUM", t.aum)}
        ${tapeMetric("30-day", t.change30d)}
        ${tapeMetric("Yield", t.yield)}
        <div class="tape-date">As of ${esc(t.aum?.date || "—")}</div>
        ${badge(st)}
      </button>`;
    }).join("");
    $$("#tape-strip [data-tape]").forEach(el => el.addEventListener("click", () => {
      state.current = el.getAttribute("data-tape"); render();
      $("#snapshot").scrollIntoView({block:"start"});
    }));
  }

  function renderSnapshot(){
    const a = asset();
    const rows = [
      ["Asset", `${a.name} (${a.ticker})`],["Issuer / manager", a.issuer],["Asset type", a.assetType],
      ["Wrapper", a.wrapper],["NAV type", a.navType],["Eligibility", a.eligibility],
      ["Chains", a.chains.join(", ")],["Authoritative record", a.ownershipRecord.detail],
      ["Public / private", a.publicStatus === "public-safe" ? "Public-safe" : "Private feedback"]
    ];
    $("#snapshot-grid").innerHTML = rows.map(([k,v]) =>
      `<dl class="snap"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></dl>`).join("");
    $("#snapshot-gaps").innerHTML = `<h3>What a reviewer should request next</h3><ul>${a.keyGaps.map(g=>`<li>${esc(g)}</li>`).join("")}</ul>`;
  }

  function renderCore(){
    const cq = state.assets.coreQuestion;
    $("#core-h").textContent = cq.question;
    $("#core-why").textContent = cq.why;
    $("#core-table tbody").innerHTML = cq.rows.map(r =>
      `<tr><td><strong>${esc(r.asset)}</strong></td><td>${esc(r.answer)}</td><td>${badge(r.status)}</td></tr>`).join("");
  }

  function claimMatchesFilters(c){
    if(!claimVisibleByMode(c)) return false;
    if(state.unverifiedOnly && !(c.status === "unverified" || c.status === "conflict")) return false;
    if(state.evidence !== "all" && c.status !== state.evidence) return false;
    if(state.search){
      const hay = `${c.label} ${c.value} ${c.id}`.toLowerCase();
      if(!hay.includes(state.search)) return false;
    }
    return true;
  }

  function claimCard(c){
    const srcs = (c.sources||[]).map(id => {
      const s = srcById(id);
      if(!s) return `<li>${esc(id)}</li>`;
      const link = s.url && /^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title);
      return `<li>${badge(s.type)} ${link} <span class="muted">· ${esc(s.id)} · checked ${esc(s.dateChecked)}</span></li>`;
    }).join("");
    const srcBlock = srcs ? `<ul class="src-list">${srcs}</ul>` : `<p class="empty">No source attached — Unverified - additional primary source required.</p>`;
    return `<details class="claim">
      <summary>
        <span><span class="c-label">${esc(c.label)}</span><span class="c-value">${esc(c.value)}</span></span>
        <span class="c-right">${badge(c.status)}<span class="c-id">${esc(c.id)}</span></span>
      </summary>
      <div class="claim-body">
        <div class="meta-row"><span>Section: ${esc(c.section)}</span><span>Date checked: ${esc(c.dateChecked)}</span><span>Evidence: ${esc(STATUS_LABEL[c.status]||c.status)}</span></div>
        ${srcBlock}
      </div>
    </details>`;
  }

  function renderClaimSections(){
    $$(".claims-section").forEach(sec => {
      const key = sec.getAttribute("data-section");
      let list = claimsForAsset().filter(c => c.section === key).filter(claimMatchesFilters);
      const target = $(".claim-list", sec);
      if(key === "gated"){
        // private section hidden entirely in public-safe mode (also via CSS)
        sec.classList.toggle("is-hidden", state.publicSafe || list.length === 0);
      }
      target.innerHTML = list.length ? list.map(claimCard).join("")
        : `<p class="empty">No claims match the current filters for this section.</p>`;
    });
  }

  function renderMissing(){
    const a = asset();
    // coverage = documentation coverage only (NOT a score)
    const all = claimsForAsset();
    const counts = {};
    all.forEach(c => { counts[c.status] = (counts[c.status]||0)+1; });
    const verified = (counts["public-primary"]||0);
    const total = all.length || 1;
    const openItems = a.missing.length;
    $("#coverage").innerHTML = `
      <span class="cov-pill">Claims tracked: <b>${all.length}</b></span>
      <span class="cov-pill">Public-primary backed: <b>${verified}</b></span>
      <span class="cov-pill">Open documents: <b>${openItems}</b></span>
      <span class="cov-pill muted">Documentation coverage only — not a score</span>`;
    let items = a.missing;
    if(state.unverifiedOnly) items = items; // already all gaps
    $("#missing-list").innerHTML = items.map(m =>
      `<li><span class="box" aria-hidden="true"></span>
        <span><span class="ci-text">${esc(m.item)}</span>
        <span class="ci-meta">Category: ${esc(m.category)}</span></span>
        <span class="prio ${esc(m.priority)}" style="margin-left:auto">${esc(m.priority)}</span></li>`).join("");
  }

  function renderContracts(){
    const a = asset();
    // chain filter options
    const sel = $("#chain-filter");
    const chains = ["all", ...a.contracts.map(c=>c.chain)];
    sel.innerHTML = chains.map(ch => `<option value="${esc(ch)}"${ch===state.chain?" selected":""}>${ch==="all"?"All chains":esc(ch)}</option>`).join("");
    if(!a.contracts.some(c=>c.chain===state.chain)) state.chain="all";
    let rows = a.contracts.filter(c => state.chain==="all" || c.chain===state.chain);
    $("#contracts-table tbody").innerHTML = rows.map(c => {
      const s = srcById(c.sourceId);
      const isAddr = /^(0x|G[A-Z0-9])/i.test(c.address);
      const addrCell = isAddr
        ? `<span class="addr"><span class="mono">${esc(c.address)}</span><button class="copy-btn" data-copy="${esc(c.address)}" aria-label="Copy address">copy</button>${s&&/^https?:/.test(s.url)?` <a class="copy-btn" href="${esc(s.url)}" target="_blank" rel="noopener">explorer</a>`:""}</span>`
        : `<span class="muted">${esc(c.address)}</span>`;
      return `<tr>
        <td>${esc(c.chain)}</td>
        <td>${addrCell}</td>
        <td>${esc(c.standard)}</td>
        <td>${esc(c.proxy)}</td>
        <td>${esc(c.controls)}</td>
        <td class="${/Unverified/.test(c.roleHolders)?"muted":""}">${esc(c.roleHolders)}</td>
        <td>${badge(c.status)}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="7" class="empty">No contracts for this filter.</td></tr>`;
  }

  function renderQuality(){
    const all = claimsForAsset().filter(claimVisibleByMode);
    const counts = {}; all.forEach(c => counts[c.status]=(counts[c.status]||0)+1);
    const max = Math.max(1, ...Object.values(counts));
    $("#quality-bars").innerHTML = Object.keys(STATUS_LABEL).map(k => {
      const n = counts[k]||0;
      const pct = Math.round((n/max)*100);
      return `<div class="qbar">
        <span>${badge(k)}</span>
        <span class="track"><span class="fill ${k}" style="width:${n?Math.max(pct,6):0}%"></span></span>
        <span class="cnt">${n}</span>
      </div>`;
    }).join("");
  }

  function renderQuestions(){
    $("#question-list").innerHTML = state.assets.reviewerQuestions.map(q =>
      `<li><span class="q-text">${esc(q)}</span><button class="copy-btn" data-copy="${esc(q)}" aria-label="Copy question">copy</button></li>`).join("");
  }

  function renderAppendix(){
    let list = state.sources.sources.slice();
    if(state.publicSafe) list = list.filter(s => s.publicStatus === "public");
    if(state.sourceSearch){
      list = list.filter(s => `${s.title} ${s.type} ${s.id} ${s.publicStatus}`.toLowerCase().includes(state.sourceSearch));
    }
    // sort: surface sources tied to current asset's claims first
    const assetSrcIds = new Set(claimsForAsset().flatMap(c => c.sources||[]));
    list.sort((x,y)=> (assetSrcIds.has(y.id)?1:0)-(assetSrcIds.has(x.id)?1:0));
    $("#appendix-list").innerHTML = list.map(s => {
      const link = /^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` : `<span class="muted">${esc(s.url)}</span>`;
      const claimList = (s.claimIds||[]).map(esc).join(", ") || "—";
      return `<div class="src">
        <div class="s-top"><span class="s-title">${esc(s.title)}</span>${badge(s.type)}</div>
        <div class="s-meta">
          <span class="s-id">${esc(s.id)}</span>
          <span>Status: ${esc(s.publicStatus)}</span>
          <span>Checked: ${esc(s.dateChecked)}</span>
          <span>Supports: ${claimList}</span>
        </div>
        <div class="s-meta">${link}</div>
      </div>`;
    }).join("") || `<p class="empty">No sources match.</p>`;
  }

  function renderAnswers(){
    const a = asset();
    const verified = claimsForAsset().filter(c => c.status==="public-primary" && c.publicSafe!==false).slice(0,3)
      .map(c=>c.label).join("; ") || "See verified facts section.";
    const qa = [
      ["What is this asset?", `${a.name} (${a.ticker}) — ${a.assetType}, wrapped as ${a.wrapper}.`],
      ["What does the token represent?", a.ownershipRecord.detail],
      ["Who is the issuer?", a.issuer],
      ["What is verified?", verified],
      ["What is the biggest diligence gap?", a.keyGaps[0] || "See gaps section."],
      ["What is public-safe vs private?", a.publicStatus==="public-safe" ? "All sections are public-safe." : "Public sections use public sources only; account-source AUM/holdings are private and hidden in public-safe mode."],
      ["What sources support the claims?", "Every claim links to a source in the Evidence Appendix, labeled by type and date checked."],
      ["What should a serious reviewer ask?", state.assets.reviewerQuestions[0]]
    ];
    $("#qa-block").innerHTML = qa.map(([q,ans]) =>
      `<div><dt>${esc(q)}</dt><dd>${esc(ans)}</dd></div>`).join("");
  }

  /* ---------- JSON-LD ---------- */
  function writeLdJson(){
    const ld = {
      "@context":"https://schema.org",
      "@type":["ResearchProject","WebSite"],
      "name":"TokenAsset",
      "description":"Independent, source-backed diligence and monitoring of tokenized real-world assets. Evidence-labeled. No scores or recommendations.",
      "url":"https://example.com/rwa-teardown/",
      "publisher":{"@type":"Organization","name":"TokenAsset"},
      "dataset": state.assets.assets.map(a => ({
        "@type":"Dataset",
        "name":`${a.name} (${a.ticker}) diligence teardown`,
        "description":`Source-labeled diligence teardown of ${a.name}. ${a.statusNote}`,
        "creativeWorkStatus": a.publicStatus,
        "keywords":["tokenized real-world assets","RWA","diligence",a.ticker,a.issuer]
      })),
      "disclaimer": state.assets.disclaimer
    };
    $("#ld-json").textContent = JSON.stringify(ld, null, 2);
  }

  /* ---------- scrollspy ---------- */
  function setupScrollSpy(){
    const links = $$("#rail-list a");
    const map = new Map(links.map(l => [l.getAttribute("data-nav"), l]));
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if(e.isIntersecting){
          links.forEach(l=>l.classList.remove("active"));
          map.get(e.target.id)?.classList.add("active");
        }
      });
    }, { rootMargin:"-40% 0px -55% 0px", threshold:0 });
    SECTION_NAV.forEach(([id]) => { const el=document.getElementById(id); if(el) obs.observe(el); });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
