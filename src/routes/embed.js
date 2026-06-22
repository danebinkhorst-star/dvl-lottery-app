import express from "express";

export const embedRouter = express.Router();

function widgetRuntime() {
  const scriptTag = document.currentScript || document.querySelector('script[src*="/embed/dvl-lottery.js"]');
  const API = scriptTag ? new URL(scriptTag.src, window.location.href).origin : "https://dvl-lottery-app.onrender.com";
  const frameParams = new URL(window.location.href).searchParams;
  const CARD_IMAGE = (() => {
    const raw = (frameParams.get("card_image") || "").trim();
    if (!raw) return "";
    try {
      const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
      const parsed = new URL(normalized, window.location.origin);
      if (!["https:", "http:"].includes(parsed.protocol)) return "";
      return parsed.href;
    } catch (_error) {
      return "";
    }
  })();
  const CARD_IMAGE_CSS = CARD_IMAGE ? `url(${JSON.stringify(CARD_IMAGE)})` : "none";
  const CARD_OVERLAY = Math.min(96, Math.max(20, Number(frameParams.get("card_overlay") || 72))) / 100;
  const CARD_POSITION = frameParams.get("card_position") || "center center";
  const SHOP_ORIGIN = (() => {
    const explicitShop = frameParams.get("shop");
    try {
      if (explicitShop) return new URL(explicitShop).origin;
      if (document.referrer) return new URL(document.referrer).origin;
    } catch (_error) {
      return "";
    }
    return "";
  })();
  const CSS_ID = "dvl-lottery-widget-css";

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = `
      .dvl-lottery-widget, .dvl-lottery-widget * { box-sizing: border-box; }
      .dvl-lottery-widget {
        --dvl-cream:#fff4dd; --dvl-paper:#fffaf0; --dvl-ink:#21150f; --dvl-red:#a33127;
        --dvl-gold:#c99522; --dvl-mustard:#f0b124; --dvl-line:#24170f; --dvl-dark:#120d09;
        --dvl-muted:#6f5540; --dvl-soft:#f5e3bd;
        --dvl-card-bg-image:${CARD_IMAGE_CSS};
        --dvl-card-overlay:${CARD_OVERLAY};
        --dvl-card-bg-position:${CARD_POSITION};
        width: 100%;
        max-width: 100%;
        min-width: 0;
        color: var(--dvl-ink);
        font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
      }
      .dvl-lottery-widget :where(h1,h2,h3,p,strong,span,a,button,input) {
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      .dvl-widget-shell {
        position: relative;
        overflow: visible;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        border: 3px solid var(--dvl-line);
        border-radius: 34px 12px 34px 12px;
        background:
          linear-gradient(135deg, rgba(255,250,240,.98), rgba(255,244,221,.98)),
          var(--dvl-cream);
        box-shadow: 10px 10px 0 rgba(0,0,0,.34);
        padding: clamp(22px, 3.6vw, 42px);
      }
      .dvl-widget-shell::before {
        display:none;
      }
      .dvl-widget-shell::after {
        display:none;
      }
      .dvl-widget-shell > * { position: relative; z-index: 1; }
      .dvl-widget-eyebrow {
        display:none;
      }
      .dvl-widget-eyebrow::before {
        content:"";
        width:9px; height:9px; border-radius:50%; background:var(--dvl-red);
        box-shadow: 0 0 0 0 rgba(163,49,39,.4);
        animation: dvlPulse 1.8s ease-out infinite;
      }
      .dvl-widget-title {
        margin:0;
        max-width: 900px;
        color:#fffaf0;
        font-family: Manrope, "Arial Black", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(34px, 4.5vw, 66px);
        font-weight: 950;
        line-height:.94;
        letter-spacing:-.015em;
        text-transform:uppercase;
        -webkit-text-stroke: .6px var(--dvl-line);
        text-shadow:2px 2px 0 var(--dvl-line), 0 8px 16px rgba(0,0,0,.18);
        paint-order: stroke fill;
      }
      .dvl-widget-copy { margin:14px 0 0; max-width:720px; color:var(--dvl-muted); font-size:clamp(15px,1.3vw,18px); font-weight:850; line-height:1.45; }
      .dvl-widget-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:24px; min-width:0; }
      .dvl-widget-compact {
        display:grid;
        grid-template-columns:minmax(0, 1.35fr) minmax(280px, .65fr);
        gap:16px;
        margin-top:24px;
        align-items:stretch;
      }
      .dvl-widget-steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:18px; }
      .dvl-widget-step {
        display:flex; align-items:center; gap:10px;
        min-height:64px; padding:12px 13px;
        border:2px solid var(--dvl-line); border-radius:20px 8px 20px 8px;
        background:rgba(255,250,240,.78);
        color:var(--dvl-ink); font-size:12px; font-weight:950; line-height:1.15; text-transform:uppercase;
      }
      .dvl-widget-step b {
        width:28px; height:28px; flex:0 0 auto; display:grid; place-items:center;
        border:2px solid var(--dvl-line); border-radius:50%; background:var(--dvl-red); color:var(--dvl-cream);
        font-size:12px; line-height:1;
      }
      .dvl-widget-card {
        width: 100%;
        min-width: 0;
        min-height:118px;
        padding:18px;
        border:2px solid var(--dvl-line);
        border-radius:24px 10px 24px 10px;
        background:var(--dvl-paper);
        box-shadow: 5px 5px 0 rgba(36,23,15,.16);
        transition: transform 180ms ease, box-shadow 180ms ease;
      }
      .dvl-widget-card:nth-child(2) { background:var(--dvl-mustard); }
      .dvl-widget-card:hover {
        transform: translate(3px, 3px);
        box-shadow: 2px 2px 0 rgba(36,23,15,.18);
      }
      .dvl-widget-card strong {
        display:block;
        color:var(--dvl-cream);
        font-family: Manrope, "Arial Black", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(24px, 2.8vw, 40px);
        font-weight:950;
        line-height:.98; text-transform:uppercase;
        -webkit-text-stroke: .45px var(--dvl-line);
        text-shadow:1px 1px 0 var(--dvl-line);
      }
      .dvl-widget-card span { display:block; margin-top:8px; color:#5f4938; font-size:12px; font-weight:950; letter-spacing:.06em; text-transform:uppercase; }
      .dvl-widget-hero-card {
        position:relative;
        overflow:hidden;
        min-height:208px;
        display:grid;
        align-content:end;
        gap:14px;
        padding:clamp(22px, 3vw, 34px);
        border:3px solid var(--dvl-line);
        border-radius:32px 10px 32px 10px;
        background:var(--dvl-dark);
        color:var(--dvl-cream);
        box-shadow:7px 7px 0 rgba(36,23,15,.22);
      }
      .dvl-widget-hero-card::before {
        content:"";
        position:absolute;
        inset:0;
        z-index:0;
        background-image:
          linear-gradient(135deg, rgba(18,13,9,.98) 0%, rgba(18,13,9,var(--dvl-card-overlay)) 55%, rgba(18,13,9,.54) 100%),
          var(--dvl-card-bg-image);
        background-size:cover;
        background-position:var(--dvl-card-bg-position);
        background-repeat:no-repeat;
        pointer-events:none;
      }
      .dvl-widget-hero-card > * {
        position:relative;
        z-index:1;
      }
      .dvl-widget-hero-card small,
      .dvl-widget-side-label {
        color:var(--dvl-mustard);
        font-size:11px;
        font-weight:950;
        letter-spacing:.1em;
        text-transform:uppercase;
      }
      .dvl-widget-hero-card strong {
        display:block;
        color:var(--dvl-cream);
        font-family:Manrope, "Arial Black", ui-sans-serif, system-ui, sans-serif;
        font-size:clamp(34px, 5.2vw, 66px);
        font-weight:950;
        line-height:.92;
        letter-spacing:-.018em;
        text-transform:uppercase;
        -webkit-text-stroke:.55px #000;
        text-shadow:2px 2px 0 #000, 0 10px 18px rgba(0,0,0,.28);
        paint-order:stroke fill;
      }
      .dvl-widget-hero-card span {
        max-width:560px;
        color:rgba(255,244,221,.82);
        font-size:14px;
        font-weight:900;
        line-height:1.35;
      }
      .dvl-widget-side { display:grid; gap:12px; min-width:0; }
      .dvl-widget-side-card {
        min-width:0;
        padding:18px;
        border:3px solid var(--dvl-line);
        border-radius:24px 8px 24px 8px;
        background:var(--dvl-mustard);
        color:var(--dvl-ink);
      }
      .dvl-widget-side-card strong {
        display:block;
        margin-top:6px;
        color:var(--dvl-cream);
        font-family:Impact, "Arial Black", sans-serif;
        font-size:clamp(34px, 4.6vw, 56px);
        line-height:.85;
        text-transform:uppercase;
        -webkit-text-stroke: 1px var(--dvl-line);
        text-shadow:1px 1px 0 var(--dvl-line), 2px 3px 0 var(--dvl-line);
      }
      .dvl-widget-side-card span {
        display:block;
        margin-top:8px;
        color:rgba(33,21,15,.72);
        font-size:12px;
        font-weight:950;
        line-height:1.25;
        text-transform:uppercase;
      }
      .dvl-widget-note {
        margin-top: 16px;
        max-width: 760px;
        color: var(--dvl-muted);
        font-size: 13px;
        font-weight: 900;
        line-height: 1.35;
      }
      .dvl-widget-countdown {
        display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-top:12px;
      }
      .dvl-widget-side .dvl-widget-countdown { grid-template-columns:repeat(2,minmax(0,1fr)); margin-top:0; }
      .dvl-widget-time {
        min-height:64px; display:grid; place-items:center; gap:2px;
        border:2px solid var(--dvl-line); border-radius:16px 6px 16px 6px;
        background:var(--dvl-dark); color:var(--dvl-cream);
        text-align:center;
      }
      .dvl-widget-time strong { display:block; font-family:Impact,"Arial Black",sans-serif; font-size:26px; line-height:.9; }
      .dvl-widget-time span { color:rgba(255,244,221,.72); font-size:9px; font-weight:950; text-transform:uppercase; }
      .dvl-widget-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
      .dvl-widget-button, .dvl-widget-form button {
        min-height:46px; display:inline-flex; align-items:center; justify-content:center;
        border:3px solid var(--dvl-line); border-radius:18px 8px 18px 8px; padding:0 20px;
        background:var(--dvl-red); color:var(--dvl-cream); box-shadow:5px 5px 0 var(--dvl-line);
        font:inherit; font-size:12px; font-weight:950; line-height:1; text-transform:uppercase; text-decoration:none; cursor:pointer;
        transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }
      .dvl-widget-button:hover, .dvl-widget-button:focus-visible, .dvl-widget-form button:hover, .dvl-widget-form button:focus-visible {
        transform: translate(3px, 3px);
        box-shadow: 2px 2px 0 var(--dvl-line);
        outline: none;
      }
      .dvl-widget-button--gold { background:var(--dvl-mustard); color:var(--dvl-ink); }
      .dvl-widget-button--ghost { background:var(--dvl-cream); color:var(--dvl-ink); }
      .dvl-widget-prize-strip {
        position: relative;
        display: grid;
        grid-template-columns: 1.1fr .9fr;
        gap: 12px;
        margin-top: 18px;
      }
      .dvl-widget-ticket {
        min-height: 132px;
        padding: 18px;
        border: 3px solid var(--dvl-line);
        border-radius: 26px 9px 26px 9px;
        background: var(--dvl-dark);
        color: var(--dvl-cream);
        box-shadow: 7px 7px 0 rgba(36,23,15,.16);
      }
      .dvl-widget-ticket small {
        display:block;
        color: var(--dvl-mustard);
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .1em;
        text-transform: uppercase;
      }
      .dvl-widget-ticket strong {
        display:block;
        margin-top: 10px;
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(30px, 4vw, 56px);
        line-height: .85;
        text-transform: uppercase;
      }
      .dvl-widget-meter {
        min-height: 132px;
        padding: 18px;
        border: 3px solid var(--dvl-line);
        border-radius: 9px 26px 9px 26px;
        background: var(--dvl-mustard);
        color: var(--dvl-ink);
      }
      .dvl-widget-meter span {
        display:block;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: .09em;
        text-transform: uppercase;
      }
      .dvl-widget-meter strong {
        display:block;
        margin-top: 8px;
        color:var(--dvl-cream);
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(32px, 5vw, 64px);
        line-height: .82;
        -webkit-text-stroke: 1px var(--dvl-line);
        text-shadow:1px 1px 0 var(--dvl-line), 2px 3px 0 var(--dvl-line);
      }
      .dvl-widget-progress {
        height: 13px;
        margin-top: 15px;
        overflow: hidden;
        border: 2px solid var(--dvl-line);
        border-radius: 999px;
        background: rgba(255,250,240,.7);
      }
      .dvl-widget-progress i {
        display:block;
        height:100%;
        width: var(--progress, 0%);
        background: var(--dvl-red);
      }
      .dvl-widget-list {
        display: grid;
        gap: 8px;
        margin-top: 18px;
      }
      .dvl-widget-row {
        display:grid;
        grid-template-columns: minmax(0,1fr) auto;
        gap: 10px;
        align-items:center;
        padding: 11px 12px;
        border: 2px solid rgba(36,23,15,.18);
        border-radius: 18px 7px 18px 7px;
        background: rgba(255,250,240,.72);
        font-size: 12px;
        font-weight: 950;
        text-transform: uppercase;
      }
      .dvl-widget-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dvl-widget-row b { color: var(--dvl-red); }
      @keyframes dvlPulse {
        0% { box-shadow: 0 0 0 0 rgba(163,49,39,.42); }
        70% { box-shadow: 0 0 0 10px rgba(163,49,39,0); }
        100% { box-shadow: 0 0 0 0 rgba(163,49,39,0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .dvl-widget-eyebrow::before { animation: none; }
        .dvl-widget-card, .dvl-widget-button, .dvl-widget-form button { transition: none; }
      }
      .dvl-widget-form { display:grid; gap:11px; margin-top:22px; max-width:680px; }
      .dvl-widget-form input {
        min-height:48px; border:3px solid var(--dvl-line); border-radius:18px; padding:12px 14px;
        background:#fffdf6; color:var(--dvl-ink); font:inherit; font-weight:800;
      }
      .dvl-widget-hidden { position:absolute !important; left:-9999px !important; width:1px !important; height:1px !important; }
      .dvl-widget-message { margin-top:14px; font-weight:900; color:var(--dvl-red); }
      .dvl-widget-error { color:var(--dvl-red); }
      @media (max-width: 720px) {
        .dvl-lottery-widget {
          width: 100%;
        }
        .dvl-widget-shell {
          border-width: 2px;
          border-radius: 26px 9px 26px 9px;
          box-shadow: 4px 4px 0 rgba(0,0,0,.28);
          padding: 16px 14px;
        }
        .dvl-widget-shell::after { display:none; }
        .dvl-widget-grid, .dvl-widget-steps { grid-template-columns:1fr; }
        .dvl-widget-compact { grid-template-columns:1fr; gap:12px; margin-top:18px; }
        .dvl-widget-hero-card { min-height:172px; padding:20px; box-shadow:4px 4px 0 rgba(36,23,15,.22); }
        .dvl-widget-hero-card strong { font-size:clamp(38px, 13vw, 54px); }
        .dvl-widget-side { gap:10px; }
        .dvl-widget-side-card { padding:15px; border-width:2px; }
        .dvl-widget-prize-strip { grid-template-columns: 1fr; }
        .dvl-widget-countdown { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .dvl-widget-title { font-size: clamp(32px, 11vw, 44px); }
        .dvl-widget-card { min-height: 92px; padding: 16px; }
        .dvl-widget-copy { width: 100%; font-size: 14px; line-height: 1.35; }
        .dvl-widget-actions { gap: 8px; }
        .dvl-widget-button, .dvl-widget-form button { width:100%; }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function storeHref(path) {
    return SHOP_ORIGIN ? `${SHOP_ORIGIN}${path}` : path;
  }

  function nextDrawTimestamp(draw) {
    const explicit = Date.parse(draw?.drawAt || draw?.endsAt || "");
    if (Number.isFinite(explicit)) return explicit;
    return Date.now() + 6 * 86400000 + 20 * 3600000;
  }

  function initCountdowns(root) {
    root.querySelectorAll("[data-dvl-countdown]").forEach((countdown) => {
      if (countdown.dataset.bound === "true") return;
      countdown.dataset.bound = "true";
      const target = Number(countdown.dataset.dvlCountdown || 0);
      const parts = {
        days: countdown.querySelector('[data-time="days"]'),
        hours: countdown.querySelector('[data-time="hours"]'),
        minutes: countdown.querySelector('[data-time="minutes"]'),
        seconds: countdown.querySelector('[data-time="seconds"]')
      };
      const pad = (value) => String(value).padStart(2, "0");
      const render = () => {
        const diff = Math.max(0, target - Date.now());
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        if (parts.days) parts.days.textContent = pad(days);
        if (parts.hours) parts.hours.textContent = pad(hours);
        if (parts.minutes) parts.minutes.textContent = pad(minutes);
        if (parts.seconds) parts.seconds.textContent = pad(seconds);
      };
      render();
      window.setInterval(render, 1000);
    });
  }

  async function fetchJson(path, options) {
    const response = await fetch(API + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kon data niet laden.");
    return data;
  }

  function liveWidget(el, data) {
    const draw = data.liveDraw;
    const countdownTarget = nextDrawTimestamp(draw);
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Live winacties</p>
      <h2 class="dvl-widget-title">${escapeHtml(draw ? draw.title : "Bestel vlees. Speel mee.")}</h2>
      <p class="dvl-widget-copy">${escapeHtml(draw?.description || "Elke bestelling vanaf €70 speelt automatisch mee. Jij bestelt premium vlees, wij registreren je lot en tonen de trekking live en transparant.")}</p>
      <div class="dvl-widget-steps" aria-label="Zo werkt Meat For Free">
        <div class="dvl-widget-step"><b>1</b><span>Bestel vanaf €70</span></div>
        <div class="dvl-widget-step"><b>2</b><span>Ontvang je lot automatisch</span></div>
        <div class="dvl-widget-step"><b>3</b><span>Volg je kansen in je dashboard</span></div>
      </div>
      <div class="dvl-widget-grid">
        <div class="dvl-widget-card"><strong>${escapeHtml(draw?.entryCount ?? 0)}</strong><span>Actieve loten</span></div>
        <div class="dvl-widget-card"><strong>€70</strong><span>1 automatisch lot</span></div>
        <div class="dvl-widget-card"><strong>${escapeHtml(draw?.prizeName || "Premium prijs")}</strong><span>${escapeHtml(draw?.prizeValue || "Live hoofdprijs")}</span></div>
      </div>
      <div class="dvl-widget-countdown" data-dvl-countdown="${escapeHtml(countdownTarget)}" aria-label="Volgende trekking">
        <div class="dvl-widget-time"><strong data-time="days">00</strong><span>Dagen</span></div>
        <div class="dvl-widget-time"><strong data-time="hours">00</strong><span>Uur</span></div>
        <div class="dvl-widget-time"><strong data-time="minutes">00</strong><span>Min</span></div>
        <div class="dvl-widget-time"><strong data-time="seconds">00</strong><span>Sec</span></div>
      </div>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Bekijk winacties</a>
        <a class="dvl-widget-button" href="${escapeHtml(storeHref("/collections/all"))}" target="_top">Shop vlees</a>
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/mijn-dvl-dashboard"))}" target="_top">Mijn dashboard</a>
      </div>
    </section>`;
    initCountdowns(el);
  }

  function freeEntryWidget(el, data) {
    const drawId = data.liveDraw?.id || "";
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Gratis deelname</p>
      <h2 class="dvl-widget-title">Doe mee zonder aankoop.</h2>
      <p class="dvl-widget-copy">Geen aankoop gedaan? Vraag 1 deelname aan voor de actieve trekking. We registreren deze op dezelfde manier als een regulier lot.</p>
      <form class="dvl-widget-form">
        <input name="firstName" autocomplete="given-name" placeholder="Voornaam">
        <input name="lastName" autocomplete="family-name" placeholder="Achternaam">
        <input name="email" type="email" autocomplete="email" required placeholder="E-mailadres">
        <input class="dvl-widget-hidden" name="website" tabindex="-1" autocomplete="off">
        <input name="drawId" type="hidden" value="${escapeHtml(drawId)}">
        <button type="submit">Vraag gratis lot aan</button>
      </form>
      <div class="dvl-widget-message" aria-live="polite"></div>
    </section>`;
    const form = el.querySelector("form");
    const message = el.querySelector(".dvl-widget-message");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "Aanvraag wordt verwerkt...";
      const payload = Object.fromEntries(new FormData(form).entries());
      try {
        const result = await fetchJson("/api/free-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        message.className = "dvl-widget-message";
        message.textContent = result.skipped ? "Je gratis deelname stond al geregistreerd voor deze trekking." : "Gelukt. Je gratis lotnummer: " + result.entry.entryNumber;
      } catch (error) {
        message.className = "dvl-widget-message dvl-widget-error";
        message.textContent = error.message;
      }
    });
  }

  function customerWidget(el, data) {
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Mijn MFF</p>
      <h2 class="dvl-widget-title">Je loten. Je trekkingen.</h2>
      <p class="dvl-widget-copy">Log in met hetzelfde account waarmee je bestelt. In je dashboard zie je je actieve loten, recente deelnames en de winactie waar je nu voor meespeelt.</p>
      <div class="dvl-widget-grid">
        <div class="dvl-widget-card"><strong>${escapeHtml(data.liveDraw?.entryCount ?? 0)}</strong><span>Loten in de live trekking</span></div>
        <div class="dvl-widget-card"><strong>€70</strong><span>Bestelling = 1 lot</span></div>
        <div class="dvl-widget-card"><strong>${escapeHtml(data.liveDraw?.prizeName || "Prijs live")}</strong><span>${escapeHtml(data.liveDraw?.prizeValue || "Huidige winactie")}</span></div>
      </div>
      <p class="dvl-widget-note">Je persoonlijke lotnummers staan alleen achter je login. Zo blijft de trekking zichtbaar, maar klantdata afgeschermd.</p>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/mijn-dvl-dashboard"))}" target="_top">Mijn dashboard</a>
        <a class="dvl-widget-button dvl-widget-button--ghost" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Winacties</a>
      </div>
    </section>`;
  }

  function liveWidget(el, data) {
    const draw = data.liveDraw;
    const countdownTarget = nextDrawTimestamp(draw);
    const entryCount = Number(draw?.entryCount || 0);
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Live trekking</p>
      <h2 class="dvl-widget-title">Bestel. Pak je lot.</h2>
      <p class="dvl-widget-copy">Vanaf EUR 70 krijgt je bestelling automatisch 1 lot voor de actieve winactie.</p>
      <div class="dvl-widget-compact">
        <div class="dvl-widget-hero-card">
          <small>Hoofdprijs nu</small>
          <strong>${escapeHtml(draw?.prizeName || "Premium vleespakket")}</strong>
          <span>${escapeHtml(draw?.prizeValue || "Actieve hoofdprijs")} · trekking transparant zichtbaar in Mijn MFF.</span>
        </div>
        <div class="dvl-widget-side">
          <div class="dvl-widget-side-card">
            <span class="dvl-widget-side-label">Deelnemers live</span>
            <strong>${escapeHtml(entryCount)}</strong>
            <span>Alle gekoppelde loten voor deze trekking.</span>
          </div>
          <div class="dvl-widget-side-card">
            <span class="dvl-widget-side-label">Lot regel</span>
            <strong>EUR 70</strong>
            <span>Bestelling vanaf dit bedrag = 1 lot.</span>
          </div>
          <div class="dvl-widget-countdown" data-dvl-countdown="${escapeHtml(countdownTarget)}" aria-label="Volgende trekking">
            <div class="dvl-widget-time"><strong data-time="days">00</strong><span>Dagen</span></div>
            <div class="dvl-widget-time"><strong data-time="hours">00</strong><span>Uur</span></div>
            <div class="dvl-widget-time"><strong data-time="minutes">00</strong><span>Min</span></div>
            <div class="dvl-widget-time"><strong data-time="seconds">00</strong><span>Sec</span></div>
          </div>
        </div>
      </div>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Bekijk winacties</a>
        <a class="dvl-widget-button" href="${escapeHtml(storeHref("/collections/all"))}" target="_top">Shop vlees</a>
        <a class="dvl-widget-button dvl-widget-button--ghost" href="${escapeHtml(storeHref("/pages/mijn-dvl-dashboard"))}" target="_top">Mijn dashboard</a>
      </div>
    </section>`;
    initCountdowns(el);
  }

  function customerWidget(el, data) {
    const draw = data.liveDraw;
    const countdownTarget = nextDrawTimestamp(draw);
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Mijn MFF</p>
      <h2 class="dvl-widget-title">Je loten op een plek.</h2>
      <p class="dvl-widget-copy">Log in en zie direct je loten, de actieve trekking en welke bestelling deelname heeft verdiend.</p>
      <div class="dvl-widget-compact">
        <div class="dvl-widget-hero-card">
          <small>Na login zichtbaar</small>
          <strong>Jouw lotnummers</strong>
          <span>Persoonlijke data blijft achter je account. De live winactie blijft openbaar controleerbaar.</span>
        </div>
        <div class="dvl-widget-side">
          <div class="dvl-widget-side-card"><span class="dvl-widget-side-label">Live trekking</span><strong>${escapeHtml(draw?.entryCount ?? 0)}</strong><span>Totaal gekoppelde loten.</span></div>
          <div class="dvl-widget-side-card"><span class="dvl-widget-side-label">Meedoen</span><strong>EUR 70</strong><span>Elke qualifying order = 1 lot.</span></div>
          <div class="dvl-widget-countdown" data-dvl-countdown="${escapeHtml(countdownTarget)}" aria-label="Volgende trekking">
            <div class="dvl-widget-time"><strong data-time="days">00</strong><span>Dagen</span></div>
            <div class="dvl-widget-time"><strong data-time="hours">00</strong><span>Uur</span></div>
            <div class="dvl-widget-time"><strong data-time="minutes">00</strong><span>Min</span></div>
            <div class="dvl-widget-time"><strong data-time="seconds">00</strong><span>Sec</span></div>
          </div>
        </div>
      </div>
      <div class="dvl-widget-list" aria-label="Dashboard inhoud">
        <div class="dvl-widget-row"><span>Actieve loten</span><b>Live</b></div>
        <div class="dvl-widget-row"><span>Orders met deelname</span><b>Account</b></div>
        <div class="dvl-widget-row"><span>Winnaars historie</span><b>Open</b></div>
      </div>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/mijn-dvl-dashboard"))}" target="_top">Mijn dashboard</a>
        <a class="dvl-widget-button dvl-widget-button--ghost" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Winacties</a>
      </div>
    </section>`;
    initCountdowns(el);
  }

  async function render(el) {
    injectStyles();
    el.innerHTML = '<section class="dvl-lottery-widget dvl-widget-shell"><p class="dvl-widget-eyebrow">Laden</p><h2 class="dvl-widget-title">MFF wordt geladen.</h2></section>';
    try {
      const data = await fetchJson("/api/site/summary");
      const type = el.getAttribute("data-dvl-lottery") || "live";
      if (type === "free-entry") return freeEntryWidget(el, data);
      if (type === "customer") return customerWidget(el, data);
      return liveWidget(el, data);
    } catch (error) {
      el.innerHTML = '<section class="dvl-lottery-widget dvl-widget-shell"><p class="dvl-widget-eyebrow">Fout</p><h2 class="dvl-widget-title">Niet geladen.</h2><p class="dvl-widget-copy">' + escapeHtml(error.message) + '</p></section>';
    }
  }

  const rendered = new WeakSet();
  function init() {
    document.querySelectorAll("[data-dvl-lottery]").forEach((el) => {
      if (rendered.has(el)) return;
      rendered.add(el);
      render(el);
    });
  }

  init();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  }
  new MutationObserver(init).observe(document.documentElement, { childList: true, subtree: true });
}

const widgetScript = `(${widgetRuntime.toString()})();`;

embedRouter.get("/dvl-lottery.js", (_req, res) => {
  res.setHeader("content-type", "application/javascript; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60");
  res.send(widgetScript);
});

embedRouter.get("/demo", (_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meat For Free Lottery Embed Demo</title>
    <style>
      body {
        margin: 0;
        overflow-x: hidden;
        background: #120d09;
        color: #fff4dd;
        font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
      }
      main {
        width: min(1180px, calc(100% - 28px));
        margin: 0 auto;
        padding: 28px 0 56px;
        display: grid;
        gap: 24px;
      }
      h1 {
        margin: 0;
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(42px, 8vw, 96px);
        line-height: .86;
        text-transform: uppercase;
        overflow-wrap: anywhere;
      }
      p { margin: 0; max-width: 720px; color: #d8c5a7; font-weight: 800; }
      @media (max-width: 720px) {
        main { width: min(1180px, calc(100% - 40px)); }
        h1 { font-size: 42px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>MFF test</h1>
        <p>Deze pagina test alle widgets zoals ze in Shopify geladen worden.</p>
      </header>
      <div data-dvl-lottery="live"></div>
      <div data-dvl-lottery="free-entry"></div>
      <div data-dvl-lottery="customer"></div>
    </main>
    <script async src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});

embedRouter.get("/frame", (req, res) => {
  const allowedWidgets = new Set(["live", "free-entry", "customer"]);
  const widget = allowedWidgets.has(String(req.query.widget || "")) ? String(req.query.widget) : "live";
  const sectionId = String(req.query.section_id || "");

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("x-frame-options", "ALLOWALL");
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meat For Free Lottery ${widget}</title>
    <style>
      html,
      body {
        min-height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      html {
        width: 100%;
      }

      body {
        width: auto;
        max-width: 100vw;
        box-sizing: border-box;
        padding: 6px 12px 18px 6px;
      }

      @media (max-width: 720px) {
        body {
          padding: 4px 10px 14px 4px;
        }
      }
    </style>
  </head>
  <body>
    <div data-dvl-lottery="${widget}"></div>
    <script>
      (() => {
        const sectionId = ${JSON.stringify(sectionId)};
        const sendHeight = () => {
          const height = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            document.documentElement.offsetHeight,
            document.body.offsetHeight
          );
          window.parent.postMessage({ type: "dvl:lottery-frame-height", sectionId, height }, "*");
        };
        window.addEventListener("load", sendHeight);
        window.addEventListener("resize", sendHeight);
        new ResizeObserver(sendHeight).observe(document.body);
        window.setInterval(sendHeight, 1200);
      })();
    </script>
    <script src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});
