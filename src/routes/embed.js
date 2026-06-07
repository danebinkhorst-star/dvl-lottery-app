import express from "express";

export const embedRouter = express.Router();

function widgetRuntime() {
  const scriptTag = document.currentScript || document.querySelector('script[src*="/embed/dvl-lottery.js"]');
  const API = scriptTag ? new URL(scriptTag.src, window.location.href).origin : "https://dvl-lottery-app.onrender.com";
  const frameParams = new URL(window.location.href).searchParams;
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
        --dvl-gold:#d2a947; --dvl-mustard:#f0bf39; --dvl-line:#24170f; --dvl-dark:#120d09;
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
        overflow: hidden;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        border: 3px solid var(--dvl-line);
        border-radius: 34px 12px 34px 12px;
        background: linear-gradient(135deg, var(--dvl-cream), var(--dvl-paper));
        box-shadow: 8px 8px 0 rgba(33,21,15,.16);
        padding: clamp(18px, 3vw, 34px);
      }
      .dvl-widget-shell::after {
        content:"DVL";
        position:absolute;
        right:-8px; bottom:-10px;
        color: rgba(163,49,39,.08);
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(72px, 14vw, 180px);
        line-height:.75;
        pointer-events:none;
      }
      .dvl-widget-eyebrow {
        width: fit-content;
        display:inline-flex; align-items:center; gap:8px;
        margin:0 0 12px;
        padding:9px 13px;
        border:2px solid var(--dvl-line);
        border-radius:999px;
        background:var(--dvl-mustard);
        box-shadow:4px 4px 0 var(--dvl-line);
        font-size:11px; font-weight:950; letter-spacing:.08em; text-transform:uppercase;
      }
      .dvl-widget-eyebrow::before { content:""; width:9px; height:9px; border-radius:50%; background:var(--dvl-red); }
      .dvl-widget-title {
        margin:0;
        max-width: 900px;
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(34px, 5vw, 76px);
        line-height:.88; letter-spacing:-.03em; text-transform:uppercase;
      }
      .dvl-widget-copy { margin:14px 0 0; max-width:680px; color:#6f5540; font-size:clamp(15px,1.3vw,18px); font-weight:800; line-height:1.45; }
      .dvl-widget-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:22px; min-width:0; }
      .dvl-widget-card {
        width: 100%;
        min-width: 0;
        min-height:112px;
        padding:18px;
        border:2px solid var(--dvl-line);
        border-radius:24px 10px 24px 10px;
        background:var(--dvl-paper);
      }
      .dvl-widget-card:nth-child(2) { background:var(--dvl-mustard); }
      .dvl-widget-card strong {
        display:block;
        font-family: Impact, "Arial Black", sans-serif;
        font-size: clamp(24px, 3vw, 42px);
        line-height:.9; text-transform:uppercase;
      }
      .dvl-widget-card span { display:block; margin-top:8px; color:#5f4938; font-size:12px; font-weight:950; letter-spacing:.06em; text-transform:uppercase; }
      .dvl-widget-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:22px; }
      .dvl-widget-button, .dvl-widget-form button {
        min-height:46px; display:inline-flex; align-items:center; justify-content:center;
        border:3px solid var(--dvl-line); border-radius:999px; padding:0 20px;
        background:var(--dvl-red); color:var(--dvl-cream); box-shadow:5px 5px 0 var(--dvl-line);
        font:inherit; font-size:12px; font-weight:950; line-height:1; text-transform:uppercase; text-decoration:none; cursor:pointer;
      }
      .dvl-widget-button--gold { background:var(--dvl-mustard); color:var(--dvl-ink); }
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
          border-radius: 24px 9px 24px 9px;
          box-shadow: none;
          padding: 16px;
        }
        .dvl-widget-grid { grid-template-columns:1fr; }
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

  async function fetchJson(path, options) {
    const response = await fetch(API + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Kon data niet laden.");
    return data;
  }

  function liveWidget(el, data) {
    const draw = data.liveDraw;
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Live winacties</p>
      <h2 class="dvl-widget-title">${escapeHtml(draw ? draw.title : "Actieve trekking")}</h2>
      <p class="dvl-widget-copy">${escapeHtml(draw?.description || "Bestel vanaf EUR 70 = automatisch 1 lot. Geen aankoop? Gebruik gratis deelname.")}</p>
      <div class="dvl-widget-grid">
        <div class="dvl-widget-card"><strong>${escapeHtml(draw?.entryCount ?? 0)}</strong><span>Actieve loten</span></div>
        <div class="dvl-widget-card"><strong>EUR 70</strong><span>1 lot vanaf bestelling</span></div>
        <div class="dvl-widget-card"><strong>${escapeHtml(draw?.prizeName || "Premium prijs")}</strong><span>${escapeHtml(draw?.prizeValue || "Live hoofdprijs")}</span></div>
      </div>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Bekijk winacties</a>
        <a class="dvl-widget-button" href="${escapeHtml(storeHref("/collections/all"))}" target="_top">Shop vlees</a>
      </div>
    </section>`;
  }

  function freeEntryWidget(el, data) {
    const drawId = data.liveDraw?.id || "";
    el.innerHTML = `<section class="dvl-lottery-widget dvl-widget-shell">
      <p class="dvl-widget-eyebrow">Gratis deelname</p>
      <h2 class="dvl-widget-title">Doe mee zonder aankoop.</h2>
      <p class="dvl-widget-copy">Vraag 1 gratis deelname aan voor de actieve trekking. Zonder bestelling, wel transparant geregistreerd.</p>
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
      <p class="dvl-widget-eyebrow">Mijn DVL dashboard</p>
      <h2 class="dvl-widget-title">Je loten op een plek.</h2>
      <p class="dvl-widget-copy">Het klantdashboard is voorbereid voor een veilige Shopify app-proxy of signed token. Tot die route actief is tonen we hier live winacties en de uitleg, maar geen persoonlijke lotnummers openbaar.</p>
      <div class="dvl-widget-grid">
        <div class="dvl-widget-card"><strong>${escapeHtml(data.liveDraw?.entryCount ?? 0)}</strong><span>Actieve loten live</span></div>
        <div class="dvl-widget-card"><strong>Veilig</strong><span>Geen publieke klantdata</span></div>
        <div class="dvl-widget-card"><strong>Next</strong><span>Customer account koppeling</span></div>
      </div>
      <div class="dvl-widget-actions">
        <a class="dvl-widget-button dvl-widget-button--gold" href="${escapeHtml(storeHref("/pages/mijn-dvl-dashboard"))}" target="_top">Mijn dashboard</a>
        <a class="dvl-widget-button" href="${escapeHtml(storeHref("/pages/actieve-loterijen"))}" target="_top">Winacties</a>
      </div>
    </section>`;
  }

  async function render(el) {
    injectStyles();
    el.innerHTML = '<section class="dvl-lottery-widget dvl-widget-shell"><p class="dvl-widget-eyebrow">Laden</p><h2 class="dvl-widget-title">DVL wordt geladen.</h2></section>';
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
    <title>DVL Lottery Embed Demo</title>
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
        <h1>DVL test</h1>
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

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("x-frame-options", "ALLOWALL");
  res.send(`<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DVL Lottery ${widget}</title>
    <style>
      html,
      body {
        width: 100%;
        min-height: 100%;
        margin: 0;
        overflow-x: hidden;
        background: transparent;
      }

      body {
        padding: 8px;
      }
    </style>
  </head>
  <body>
    <div data-dvl-lottery="${widget}"></div>
    <script src="/embed/dvl-lottery.js"></script>
  </body>
</html>`);
});
