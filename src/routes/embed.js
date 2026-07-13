import express from "express";

export const embedRouter = express.Router();

function widgetRuntime() {
  const scriptTag = document.currentScript || document.querySelector('script[src*="/embed/dvl-lottery.js"]');
  const API = scriptTag ? new URL(scriptTag.src, window.location.href).origin : "https://dvl-lottery-app.onrender.com";
  const frameParams = new URL(window.location.href).searchParams;
  const CSS_ID = "mff-lottery-widget-css";
  const SHOP_ORIGIN = (() => {
    const explicitShop = frameParams.get("shop");
    try {
      if (explicitShop) return new URL(explicitShop).origin;
      if (document.referrer) return new URL(document.referrer).origin;
      if (window.location.origin !== API) return window.location.origin;
    } catch (_error) {
      return "";
    }
    return "";
  })();

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = `
      .mff-widget,.mff-widget *{box-sizing:border-box}
      .mff-widget{
        --mff-cream:#fff7ea;
        --mff-paper:#fffdf7;
        --mff-ink:#21150f;
        --mff-muted:#765f4d;
        --mff-gold:#efb12c;
        --mff-red:#b72b22;
        --mff-line:#21150f;
        --mff-soft:#f2dfbc;
        width:100%;
        max-width:100%;
        min-width:0;
        color:var(--mff-ink);
        font-family:Manrope,ui-sans-serif,system-ui,sans-serif;
      }
      .mff-widget :where(p,span,a,button,input){overflow-wrap:anywhere}
      .mff-widget :where(h1,h2,h3,strong){overflow-wrap:normal;word-break:normal}
      .mff-shell{
        position:relative;
        width:100%;
        max-width:100%;
        min-width:0;
        overflow:hidden;
        border:2px solid var(--mff-line);
        border-radius:24px 8px 24px 8px;
        background:linear-gradient(135deg,var(--mff-paper),var(--mff-cream));
        box-shadow:7px 7px 0 rgba(33,21,15,.18);
        padding:clamp(18px,3vw,34px);
      }
      .mff-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:clamp(16px,3vw,32px);align-items:end}
      .mff-kicker{margin:0 0 10px;color:var(--mff-red);font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}
      .mff-title{
        margin:0;
        color:#fff8ea;
        font-size:clamp(38px,6vw,82px);
        font-weight:950;
        line-height:.88;
        letter-spacing:-.02em;
        text-transform:uppercase;
        -webkit-text-stroke:1px var(--mff-line);
        text-shadow:2px 2px 0 var(--mff-line),4px 5px 0 rgba(33,21,15,.16);
        paint-order:stroke fill;
      }
      .mff-title--ink{color:var(--mff-ink);-webkit-text-stroke:0;text-shadow:none}
      .mff-copy{margin:14px 0 0;max-width:720px;color:var(--mff-muted);font-size:clamp(14px,1.4vw,18px);font-weight:850;line-height:1.45}
      .mff-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
      .mff-button,.mff-form button{
        min-height:46px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        border:3px solid var(--mff-line);
        border-radius:18px 7px 18px 7px;
        background:var(--mff-gold);
        color:var(--mff-ink);
        box-shadow:5px 5px 0 var(--mff-line);
        padding:0 20px;
        font:inherit;
        font-size:12px;
        font-weight:950;
        line-height:1;
        text-decoration:none;
        text-transform:uppercase;
        cursor:pointer;
        transition:transform 160ms ease,box-shadow 160ms ease;
      }
      .mff-button:hover,.mff-button:focus-visible,.mff-form button:hover,.mff-form button:focus-visible{transform:translate(3px,3px);box-shadow:2px 2px 0 var(--mff-line);outline:0}
      .mff-button--red{background:var(--mff-red);color:var(--mff-cream)}
      .mff-button--paper{background:var(--mff-paper);color:var(--mff-ink)}
      .mff-panel{
        border:2px solid var(--mff-line);
        border-radius:22px 8px 22px 8px;
        background:rgba(255,253,247,.86);
        padding:18px;
      }
      .mff-panel--gold{background:var(--mff-gold)}
      .mff-panel--red{background:var(--mff-red);color:var(--mff-cream)}
      .mff-number{display:block;margin-top:4px;font-size:clamp(34px,4.6vw,60px);font-weight:950;line-height:.9;letter-spacing:-.04em}
      .mff-label{display:block;color:inherit;font-size:11px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;opacity:.76}
      .mff-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
      .mff-mini{min-height:92px;border:2px solid var(--mff-line);border-radius:18px 6px 18px 6px;background:var(--mff-paper);padding:14px}
      .mff-mini strong{display:block;font-size:clamp(20px,2.3vw,34px);font-weight:950;line-height:.95;text-transform:uppercase}
      .mff-mini span{display:block;margin-top:6px;color:var(--mff-muted);font-size:11px;font-weight:950;text-transform:uppercase}
      .mff-progress{height:16px;overflow:hidden;border:2px solid var(--mff-line);border-radius:999px;background:var(--mff-paper);margin-top:14px}
      .mff-progress i{display:block;height:100%;width:var(--progress,0%);background:linear-gradient(90deg,var(--mff-red),var(--mff-gold));transition:width 320ms ease}
      .mff-countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
      .mff-time{min-height:58px;display:grid;place-items:center;text-align:center;border:2px solid var(--mff-line);border-radius:16px 6px 16px 6px;background:var(--mff-paper)}
      .mff-time strong{font-size:24px;font-weight:950;line-height:1}
      .mff-time span{font-size:9px;font-weight:950;text-transform:uppercase;color:var(--mff-muted)}
      .mff-list{display:grid;gap:10px;margin-top:18px}
      .mff-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:12px 0;border-bottom:1px solid rgba(33,21,15,.18);font-weight:900}
      .mff-row:last-child{border-bottom:0}
      .mff-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mff-row b{color:var(--mff-red)}
      .mff-form{display:grid;gap:10px;margin-top:20px;max-width:680px}
      .mff-form input{width:100%;min-height:48px;border:2px solid var(--mff-line);border-radius:14px 5px 14px 5px;background:var(--mff-paper);padding:12px 14px;color:var(--mff-ink);font:inherit;font-weight:850}
      .mff-hidden{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important}
      .mff-message{margin-top:12px;color:var(--mff-red);font-weight:900}
      .mff-cart-lines{display:grid;gap:8px;margin-top:12px;color:var(--mff-muted);font-size:13px;font-weight:850}
      .mff-badge{display:inline-flex;width:max-content;align-items:center;gap:8px;border:2px solid var(--mff-line);border-radius:14px 5px 14px 5px;background:var(--mff-gold);padding:8px 11px;color:var(--mff-ink);font-size:11px;font-weight:950;text-transform:uppercase}
      @media(max-width:760px){
        .mff-shell{padding:16px 14px;border-radius:22px 7px 22px 7px;box-shadow:5px 5px 0 rgba(33,21,15,.16)}
        .mff-hero{grid-template-columns:1fr;gap:14px}
        .mff-title{font-size:clamp(36px,11vw,52px)}
        .mff-card-grid{grid-template-columns:1fr}
        .mff-actions{gap:8px}
        .mff-button,.mff-form button{width:100%}
        .mff-countdown{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media(prefers-reduced-motion:reduce){.mff-button,.mff-form button,.mff-progress i{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function formatEuro(cents) {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format((Number(cents) || 0) / 100);
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
    root.querySelectorAll("[data-mff-countdown]").forEach((countdown) => {
      if (countdown.dataset.bound === "true") return;
      countdown.dataset.bound = "true";
      const target = Number(countdown.dataset.mffCountdown || 0);
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

  async function fetchCart() {
    const endpoint = SHOP_ORIGIN ? `${SHOP_ORIGIN}/cart.js` : "/cart.js";
    if (new URL(endpoint, window.location.href).origin === API) {
      throw new Error("Shopify cart alleen beschikbaar op de storefront.");
    }
    const response = await fetch(endpoint, { credentials: "include" });
    if (!response.ok) throw new Error("Winkelwagen niet bereikbaar.");
    return response.json();
  }

  function countdownMarkup(draw) {
    const target = nextDrawTimestamp(draw);
    return `<div class="mff-countdown" data-mff-countdown="${escapeHtml(target)}" aria-label="Volgende trekking">
      <div class="mff-time"><strong data-time="days">00</strong><span>Dagen</span></div>
      <div class="mff-time"><strong data-time="hours">00</strong><span>Uur</span></div>
      <div class="mff-time"><strong data-time="minutes">00</strong><span>Min</span></div>
      <div class="mff-time"><strong data-time="seconds">00</strong><span>Sec</span></div>
    </div>`;
  }

  function liveWidget(el, data) {
    const draw = data.liveDraw;
    const ruleLabel = data.rule?.label || "1 gratis lot vanaf €70";
    el.innerHTML = `<section class="mff-widget mff-shell">
      <div class="mff-hero">
        <div>
          <p class="mff-kicker">Live winactie</p>
          <h2 class="mff-title">Bestel. Pak je lot.</h2>
          <p class="mff-copy">${escapeHtml(ruleLabel)}. Volg je loten en trekkingen transparant in Mijn MFF.</p>
          <div class="mff-actions">
            <a class="mff-button" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Bekijk winacties</a>
            <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref("/collections/all"))}" target="_top">Shop vlees</a>
          </div>
        </div>
        <div class="mff-panel mff-panel--gold">
          <span class="mff-label">Hoofdprijs nu</span>
          <strong class="mff-number">${escapeHtml(draw?.prizeName || "Vleespakket")}</strong>
          <p class="mff-copy">${escapeHtml(draw?.prizeValue || "Actieve trekking")} · ${escapeHtml(draw?.entryCount ?? 0)} loten live</p>
          ${countdownMarkup(draw)}
        </div>
      </div>
    </section>`;
    initCountdowns(el);
  }

  function cartWidget(el, data) {
    const threshold = Number(data.rule?.minimumCents || 7000);
    const draw = data.liveDraw;
    const renderCart = (cart, errorMessage = "") => {
      const total = Number(cart?.total_price || 0);
      const itemCount = Number(cart?.item_count || 0);
      const remaining = Math.max(0, threshold - total);
      const progress = threshold > 0 ? Math.min(100, Math.round((total / threshold) * 100)) : 0;
      const reached = remaining === 0 && itemCount > 0;
      el.innerHTML = `<section class="mff-widget mff-shell">
        <span class="mff-badge">Gratis lot</span>
        <h2 class="mff-title mff-title--ink">${reached ? "Lot actief." : "Nog " + formatEuro(remaining)}</h2>
        <p class="mff-copy">${itemCount === 0 ? "Je winkelwagen is leeg. Voeg vlees toe en speel mee vanaf " + formatEuro(threshold) + "." : reached ? "Je bestelling haalt de grens. Na checkout koppelen we je gratis lot automatisch." : "Tot je gratis lot bij de actieve winactie."}</p>
        <div class="mff-progress" aria-label="Voortgang naar gratis lot" style="--progress:${progress}%"><i></i></div>
        <div class="mff-cart-lines">
          <span>Winkelwagen: ${formatEuro(total)}</span>
          <span>Drempel: ${formatEuro(threshold)}</span>
          ${errorMessage ? `<span>${escapeHtml(errorMessage)}</span>` : ""}
        </div>
        <div class="mff-actions">
          <a class="mff-button" href="${escapeHtml(storeHref(itemCount > 0 ? "/checkout" : "/collections/all"))}" target="_top">${itemCount > 0 ? "Afrekenen" : "Shop vlees"}</a>
          <a class="mff-button mff-button--paper" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Winactie</a>
        </div>
      </section>`;
    };
    renderCart({ total_price: 0, item_count: 0 });
    const refresh = async () => {
      try {
        renderCart(await fetchCart());
      } catch (_error) {
        renderCart({ total_price: 0, item_count: 0 }, "Plaats deze cart-widget direct in Shopify zodat hij je winkelwagen kan lezen.");
      }
    };
    refresh();
    window.addEventListener("cart:updated", refresh);
    window.addEventListener("mff:cart-updated", refresh);
  }

  function winnersWidget(el, data) {
    const winners = Array.isArray(data.latestWinners) ? data.latestWinners.slice(0, 5) : [];
    el.innerHTML = `<section class="mff-widget mff-shell">
      <p class="mff-kicker">Winnaars</p>
      <h2 class="mff-title mff-title--ink">Echte trekkingen.</h2>
      <p class="mff-copy">Laat recente winnaars zien zonder lange uitleg. Bewijs boven praatjes.</p>
      <div class="mff-list">
        ${winners.length ? winners.map((winner) => `<div class="mff-row"><span>${escapeHtml(winner.customerName || winner.email || "MFF winnaar")}</span><b>${escapeHtml(winner.prizeName || "Prijs")}</b></div>`).join("") : `<div class="mff-row"><span>Nog geen winnaars gepubliceerd</span><b>Live</b></div>`}
      </div>
    </section>`;
  }

  function customerWidget(el, data) {
    const draw = data.liveDraw;
    el.innerHTML = `<section class="mff-widget mff-shell">
      <div class="mff-hero">
        <div>
          <p class="mff-kicker">Mijn MFF</p>
          <h2 class="mff-title">Je loten. Je trekkingen.</h2>
          <p class="mff-copy">Een rustig dashboard voor actieve loten, gekoppelde orders en winacties.</p>
          <div class="mff-actions">
            <a class="mff-button" href="${escapeHtml(storeHref("/pages/mijn-mff-dashboard"))}" target="_top">Open dashboard</a>
          </div>
        </div>
        <div class="mff-panel">
          <span class="mff-badge">Dashboard</span>
          <div class="mff-list">
            <div class="mff-row"><span>Loten in live trekking</span><b>${escapeHtml(draw?.entryCount ?? 0)}</b></div>
            <div class="mff-row"><span>Hoofdprijs</span><b>${escapeHtml(draw?.prizeName || "Prijs")}</b></div>
            <div class="mff-row"><span>Persoonlijke loten</span><b>Na login</b></div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function freeEntryWidget(el, data) {
    const drawId = data.liveDraw?.id || "";
    el.innerHTML = `<section class="mff-widget mff-shell">
      <p class="mff-kicker">Gratis deelname</p>
      <h2 class="mff-title mff-title--ink">Een keer gratis meedoen.</h2>
      <form class="mff-form">
        <input name="firstName" autocomplete="given-name" placeholder="Voornaam">
        <input name="lastName" autocomplete="family-name" placeholder="Achternaam">
        <input name="email" type="email" autocomplete="email" required placeholder="E-mailadres">
        <input class="mff-hidden" name="website" tabindex="-1" autocomplete="off">
        <input name="drawId" type="hidden" value="${escapeHtml(drawId)}">
        <button type="submit">Vraag gratis lot aan</button>
      </form>
      <div class="mff-message" aria-live="polite"></div>
    </section>`;
    const form = el.querySelector("form");
    const message = el.querySelector(".mff-message");
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
        message.textContent = result.skipped ? "Je gratis deelname stond al geregistreerd." : "Gelukt. Lotnummer: " + result.entry.entryNumber;
      } catch (error) {
        message.textContent = error.message;
      }
    });
  }

  async function render(el) {
    injectStyles();
    el.innerHTML = '<section class="mff-widget mff-shell"><p class="mff-kicker">Laden</p><h2 class="mff-title mff-title--ink">MFF wordt geladen.</h2></section>';
    try {
      const data = await fetchJson("/api/site/summary");
      const type = el.getAttribute("data-dvl-lottery") || "live";
      if (type === "free-entry") return freeEntryWidget(el, data);
      if (type === "customer") return customerWidget(el, data);
      if (type === "cart") return cartWidget(el, data);
      if (type === "winners") return winnersWidget(el, data);
      return liveWidget(el, data);
    } catch (error) {
      el.innerHTML = '<section class="mff-widget mff-shell"><p class="mff-kicker">Fout</p><h2 class="mff-title mff-title--ink">Niet geladen.</h2><p class="mff-copy">' + escapeHtml(error.message) + '</p></section>';
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
      body{margin:0;overflow-x:hidden;background:#fff7ea;color:#21150f;font-family:Manrope,ui-sans-serif,system-ui,sans-serif}
      main{width:min(1180px,calc(100% - 28px));margin:0 auto;padding:28px 0 56px;display:grid;gap:24px}
      h1{margin:0;font-size:clamp(42px,8vw,96px);line-height:.86;text-transform:uppercase}
      p{margin:0;max-width:720px;color:#765f4d;font-weight:850}
    </style>
  </head>
  <body>
    <main>
      <header><h1>MFF embeds</h1><p>Live widgets zoals ze in Shopify kunnen worden geplaatst.</p></header>
      <div data-dvl-lottery="live"></div>
      <div data-dvl-lottery="cart"></div>
      <div data-dvl-lottery="winners"></div>
      <div data-dvl-lottery="customer"></div>
      <div data-dvl-lottery="free-entry"></div>
    </main>
    <script async src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});

embedRouter.get("/frame", (req, res) => {
  const allowedWidgets = new Set(["live", "free-entry", "customer", "cart", "winners"]);
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
      html,body{min-height:100%;margin:0;overflow:hidden;background:transparent}
      body{width:auto;max-width:100vw;box-sizing:border-box;padding:6px 12px 18px 6px}
      @media(max-width:720px){body{padding:4px 10px 14px 4px}}
    </style>
  </head>
  <body>
    <div data-dvl-lottery="${widget}"></div>
    <script>
      (() => {
        const sectionId = ${JSON.stringify(sectionId)};
        const sendHeight = () => {
          const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.documentElement.offsetHeight, document.body.offsetHeight);
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
