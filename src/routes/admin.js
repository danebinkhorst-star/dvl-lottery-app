import express from "express";
import { db, id, nowIso } from "../db.js";
import { createDraw, drawWinner, getOrCreateCustomer } from "../services/lottery.js";
import { syncAllCustomerDashboardMetafields, syncCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { getLotteryRule, updateLotteryRule } from "../services/settings.js";
import { writeAuditLog } from "../services/audit.js";
import { brandMarkSvg, brandPalette } from "../services/admin-brand.js";
import { icon } from "../services/admin-icons.js";
import { formatEuro, makeEntryNumber } from "../utils.js";

export const adminRouter = express.Router();
adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

const urlencoded = express.urlencoded({ extended: false, limit: "16kb" });
const drawStatuses = ["DRAFT", "LIVE", "DRAWN", "ARCHIVED"];
const entryStatuses = ["ACTIVE", "WINNER", "VOID"];
const entrySources = ["ORDER_THRESHOLD", "FREE_ENTRY", "MANUAL", "SUBSCRIPTION"];

function actor(req) {
  return req.get("authorization") ? "admin" : "admin";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textParam(value) {
  return String(value || "").trim();
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function option(value, current, label) {
  return `<option value="${escapeHtml(value)}"${String(current || "") === String(value) ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function statusLabel(status) {
  const labels = {
    DRAFT: "Concept",
    LIVE: "Live",
    DRAWN: "Getrokken",
    ARCHIVED: "Gearchiveerd",
    ACTIVE: "Actief",
    WINNER: "Winnaar",
    VOID: "Ongeldig",
    ORDER_THRESHOLD: "Orderlot",
    FREE_ENTRY: "Gratis deelname",
    MANUAL: "Handmatig",
    SUBSCRIPTION: "Abonnement",
    paid: "Betaald",
    pending: "In afwachting",
    refunded: "Terugbetaald",
    cancelled: "Geannuleerd"
  };
  return labels[status] || status || "-";
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase().replaceAll("_", "-");
  return `<span class="status status--${escapeHtml(normalized)}">${escapeHtml(statusLabel(status))}</span>`;
}

function percent(part, total) {
  if (!Number(total || 0)) return "0%";
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 100)}%`;
}

function ratio(part, total) {
  if (!Number(total || 0)) return 0;
  return Math.max(3, Math.min(100, Math.round((Number(part || 0) / Number(total || 0)) * 100)));
}

function dateInput(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isoDateParam(value) {
  const raw = textParam(value);
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function moneyParamToCents(value) {
  const raw = textParam(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function maybeIsoDate(value) {
  const raw = isoDateParam(value);
  return raw ? new Date(`${raw}T00:00:00.000Z`).toISOString() : null;
}

function euroInputToCents(value) {
  const cents = moneyParamToCents(value);
  return cents === null ? null : Math.max(1, cents);
}

function ruleLabel(rule) {
  return rule.LOT_RULE_MODE === "PER_AMOUNT"
    ? `1 lot per ${formatEuro(rule.LOT_PER_CENTS)}`
    : `1 lot vanaf ${formatEuro(rule.LOT_ORDER_MINIMUM_CENTS)}`;
}

function page(title, active, body) {
  const menu = [
    ["overzicht", "/admin", "LayoutDashboard", "Overzicht"],
    ["analyse", "/admin/analyse", "ChartNoAxesCombined", "Analyse"],
    ["winacties", "/admin/winacties", "Gift", "Winacties"],
    ["loten", "/admin/loten", "Tickets", "Loten"],
    ["orders", "/admin/orders", "ShoppingCart", "Orders"],
    ["deelnemers", "/admin/deelnemers", "Users", "Deelnemers"],
    ["compliance", "/admin/compliance", "ShieldCheck", "Compliance"],
    ["sync", "/admin/sync", "RefreshCw", "Synchronisatie"],
    ["regels", "/admin/regels", "SlidersHorizontal", "Regels"],
    ["nieuw", "/admin/new-draw", "Plus", "Nieuwe winactie"],
    ["embed", "/admin/embed", "ExternalLink", "Embed voorbeeld"]
  ];
  const mobileTabs = [
    ["overzicht", "/admin", "LayoutDashboard", "Overzicht"],
    ["analyse", "/admin/analyse", "ChartNoAxesCombined", "Analyse"],
    ["winacties", "/admin/winacties", "Gift", "Winacties"],
    ["orders", "/admin/orders", "ShoppingCart", "Orders"],
    ["meer", "/admin/menu", "Menu", "Meer"]
  ];

  return `<!doctype html>
  <html lang="nl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg:${brandPalette.cream};
          --panel:${brandPalette.paper};
          --panel-alt:#fff;
          --ink:${brandPalette.ink};
          --muted:${brandPalette.muted};
          --line:#d9d4c7;
          --line-soft:#ece7dc;
          --forest:${brandPalette.forest};
          --moss:${brandPalette.moss};
          --sage:${brandPalette.sage};
          --leaf:${brandPalette.leaf};
          --sand:${brandPalette.sand};
          --success:#25613b;
          --warning:#8a5a0a;
          --danger:#9b2226;
        }
        * { box-sizing:border-box; }
        html, body { margin:0; min-height:100%; background:var(--bg); color:var(--ink); font-family:Manrope, ui-sans-serif, system-ui, sans-serif; }
        body { font-weight:650; -webkit-font-smoothing:antialiased; }
        a { color:inherit; }
        .app-shell { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
        .sidebar { position:sticky; top:0; height:100vh; overflow:auto; padding:20px 14px; background:var(--forest); color:#f9fbf6; border-right:1px solid rgba(255,255,255,.08); }
        .sidebar-brand { display:flex; justify-content:center; padding:4px 6px 22px; color:inherit; text-decoration:none; }
        .brand-mark { width:62px; height:70px; display:block; }
        .brand { display:flex; align-items:center; text-decoration:none; min-width:0; }
        .menu-title { margin:18px 8px 8px; color:rgba(249,251,246,.46); font-size:10px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
        .menu-link { min-height:42px; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:8px; color:rgba(249,251,246,.78); text-decoration:none; font-size:13px; font-weight:800; border:1px solid transparent; }
        .menu-link:hover, .menu-link:focus-visible { background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.06); color:#fff; outline:none; }
        .menu-link--active { background:rgba(148,190,70,.14); border-color:rgba(148,190,70,.26); color:#fff; }
        .menu-left { display:flex; align-items:center; gap:10px; min-width:0; }
        .menu-icon { width:28px; height:28px; display:grid; place-items:center; flex:0 0 auto; border-radius:8px; background:rgba(255,255,255,.06); color:var(--leaf); }
        .menu-icon svg { width:16px; height:16px; }
        .content { min-width:0; }
        header { position:sticky; top:0; z-index:5; min-height:68px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 24px; border-bottom:1px solid var(--line); background:rgba(255,252,247,.94); backdrop-filter:blur(14px); }
        .top-tools { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
        .mobile-tabbar { display:none; }
        main { width:min(100%,1440px); margin:0 auto; padding:26px clamp(18px,3vw,34px) 56px; }
        h1, h2, h3, p { margin:0; }
        h1 { max-width:800px; font-size:clamp(32px,4vw,48px); line-height:1.05; font-weight:950; }
        h2 { font-size:clamp(20px,2vw,28px); line-height:1.1; font-weight:950; }
        h3 { font-size:16px; line-height:1.25; font-weight:900; }
        .eyebrow { margin-bottom:8px; color:var(--moss); font-size:11px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
        .muted { color:var(--muted); font-weight:650; }
        .topbar { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; margin-bottom:20px; }
        .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-end; }
        .button, button { min-height:40px; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:0 14px; border:1px solid var(--moss); border-radius:8px; background:var(--moss); color:#fff; font:inherit; font-size:12px; font-weight:850; text-decoration:none; cursor:pointer; }
        .button svg, button svg { width:15px; height:15px; }
        .button:hover, button:hover, .button:focus-visible, button:focus-visible { background:#527838; border-color:#527838; outline:none; }
        .button--ghost { background:var(--panel-alt); border-color:var(--line); color:var(--ink); }
        .button--ghost:hover, .button--ghost:focus-visible { background:#f8f6f0; border-color:#cbc3b2; color:var(--ink); }
        .button--gold { background:#eef5df; border-color:#cbdba2; color:var(--forest); }
        .button--gold:hover, .button--gold:focus-visible { background:#e4efcd; border-color:#bbcf8a; color:var(--forest); }
        .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:24px; }
        .grid-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .grid-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .card, .panel, .filters { min-width:0; border:1px solid var(--line); border-radius:10px; background:var(--panel); box-shadow:none; }
        .card { min-height:132px; padding:18px; }
        .card--tint-0 { background:linear-gradient(180deg,#fffdf9,#faf7ef); }
        .card--tint-1 { background:linear-gradient(180deg,#fcfdf8,#f4f8e9); }
        .card--tint-2 { background:linear-gradient(180deg,#fffdf8,#f8f3e7); }
        .card--tint-3 { background:linear-gradient(180deg,#fcfdf9,#eef4e5); }
        .card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .card-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:10px; background:rgba(95,141,62,.12); color:var(--moss); }
        .stat { margin-top:10px; color:var(--ink); font-size:clamp(28px,3.5vw,42px); line-height:1; font-weight:950; letter-spacing:0; }
        .card p:last-child { margin-top:8px; color:var(--muted); font-size:13px; }
        .section-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:30px 0 12px; }
        .panel { overflow:hidden; }
        .panel-pad { padding:18px; }
        .panel-title { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
        table { width:100%; border-collapse:collapse; background:transparent; }
        th, td { padding:12px 14px; border-bottom:1px solid var(--line-soft); text-align:left; vertical-align:middle; font-size:13px; }
        th { background:#f7f5ef; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
        td strong { display:block; font-size:14px; font-weight:900; }
        tbody tr:hover { background:#faf8f2; }
        .status { display:inline-flex; align-items:center; justify-content:center; min-width:0; padding:5px 9px; border:1px solid var(--line); border-radius:999px; background:#f8fafc; color:#374151; font-size:11px; font-weight:850; }
        .status--live, .status--active, .status--paid { background:#edf6ee; border-color:#c9e1cb; color:var(--success); }
        .status--drawn, .status--winner { background:#faf2dd; border-color:#ead59f; color:var(--warning); }
        .status--void, .status--cancelled, .status--refunded, .status--archived { background:#faeceb; border-color:#e7c1bf; color:var(--danger); }
        .status--goed, .status--laag { background:#edf6ee; border-color:#c9e1cb; color:var(--success); }
        .status--monitor, .status--controle, .status--middel, .status--check { background:#faf2dd; border-color:#ead59f; color:var(--warning); }
        .status--actie, .status--hoog { background:#faeceb; border-color:#e7c1bf; color:var(--danger); }
        .filters { padding:18px; margin-bottom:22px; }
        .filter-grid, .form-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; align-items:end; }
        .form-grid { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
        label { display:block; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.04em; text-transform:uppercase; }
        input, textarea, select { width:100%; min-height:40px; margin-top:6px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); font:inherit; font-size:13px; font-weight:650; }
        textarea { min-height:108px; resize:vertical; }
        input:focus, textarea:focus, select:focus { outline:3px solid rgba(95,141,62,.12); border-color:var(--moss); }
        .wide { grid-column:span 2; }
        form.inline-form { display:inline; margin:0; }
        .empty { padding:26px; color:var(--muted); font-size:14px; }
        .bar { height:8px; overflow:hidden; border-radius:999px; background:#e7e2d6; }
        .bar span { display:block; height:100%; border-radius:999px; background:var(--moss); }
        .chart-shell { display:grid; gap:14px; }
        .chart-wrap { padding:14px 14px 10px; border:1px solid var(--line); border-radius:10px; background:linear-gradient(180deg,#fffdf9,#fbf8ef); }
        .chart-svg { width:100%; height:auto; display:block; }
        .chart-meta { display:flex; flex-wrap:wrap; gap:8px 16px; justify-content:space-between; align-items:center; }
        .chart-legend { display:flex; flex-wrap:wrap; gap:12px; color:var(--muted); font-size:12px; }
        .legend-item { display:inline-flex; align-items:center; gap:7px; }
        .legend-dot { width:10px; height:10px; border-radius:999px; }
        .legend-dot--entries { background:var(--moss); }
        .legend-dot--orders { background:var(--sage); }
        .chart-note { color:var(--muted); font-size:12px; }
        .stack { display:grid; gap:12px; }
        .metric-row { display:grid; gap:7px; }
        .metric-row > div:first-child { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:12px; font-weight:850; }
        .ops-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
        .ops-icon { width:34px; height:34px; display:grid; place-items:center; border-radius:8px; background:#eff4e5; color:var(--forest); }
        .ops-icon svg { width:16px; height:16px; }
        .helper { margin-top:8px; color:var(--muted); font-size:12px; font-weight:650; text-transform:none; letter-spacing:0; }
        .more-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
        .more-link { min-height:86px; display:flex; align-items:center; gap:12px; padding:14px; border:1px solid var(--line); border-radius:12px; background:#fff; text-decoration:none; }
        .more-link:hover, .more-link:focus-visible { outline:none; border-color:#cbdba2; background:#fbfdf7; }
        .more-link strong { display:block; font-size:14px; font-weight:900; }
        @media (max-width:1100px) { .grid, .grid-3, .grid-2 { grid-template-columns:repeat(2,minmax(0,1fr)); } .filter-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:900px) {
          html, body { background:#f4f1e8; }
          .app-shell { grid-template-columns:1fr; }
          .sidebar { display:none; }
          header { top:0; min-height:64px; align-items:center; flex-direction:row; gap:10px; padding:10px 12px; padding-top:max(10px, env(safe-area-inset-top)); background:rgba(255,252,247,.82); border-bottom:1px solid rgba(217,212,199,.78); box-shadow:0 8px 22px rgba(20,18,13,.06); backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px); }
          header .brand-mark { width:48px; height:54px; }
          .top-tools { flex:1 1 auto; flex-wrap:nowrap; justify-content:flex-end; gap:7px; overflow-x:auto; padding:2px 0; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
          .top-tools::-webkit-scrollbar { display:none; }
          .top-tools .button { min-height:36px; padding:0 11px; border-radius:999px; white-space:nowrap; box-shadow:0 1px 0 rgba(255,255,255,.75) inset; }
          .top-tools .button--ghost:first-child { display:none; }
          .mobile-tabbar { position:fixed; left:10px; right:10px; bottom:10px; bottom:max(10px, env(safe-area-inset-bottom)); z-index:20; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:4px; min-height:64px; padding:7px; border:1px solid rgba(217,212,199,.88); border-radius:24px; background:rgba(255,252,247,.86); box-shadow:0 18px 46px rgba(20,18,13,.18); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); }
          .mobile-tab-link { min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; border-radius:18px; color:#686159; text-decoration:none; font-size:10px; line-height:1; font-weight:850; }
          .mobile-tab-link svg { width:20px; height:20px; }
          .mobile-tab-label { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .mobile-tab-link--active { background:#172112; color:#fff9ee; }
          .mobile-tab-link--active svg { color:var(--leaf); }
          .topbar { grid-template-columns:1fr; align-items:start; }
          .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-bottom:16px; }
          .grid-3, .grid-2 { grid-template-columns:1fr; }
          .card { min-height:126px; padding:14px; border-radius:18px; }
          .card-icon { width:34px; height:34px; border-radius:12px; }
          .stat { font-size:32px; }
          .card p:last-child { font-size:12px; line-height:1.35; }
          .form-grid { grid-template-columns:1fr; }
          .wide { grid-column:auto; }
          .panel, .filters { border-radius:18px; }
          .panel-pad, .filters { padding:14px; }
          .section-head { align-items:flex-start; flex-direction:column; gap:8px; margin:22px 0 10px; }
          .ops-item { border-radius:16px; grid-template-columns:auto minmax(0,1fr) auto; }
          .chart-wrap { border-radius:16px; padding:10px 8px 8px; }
          .filter-grid { grid-template-columns:1fr; }
          .panel { overflow-x:auto; -webkit-overflow-scrolling:touch; }
          .more-list { grid-template-columns:1fr; gap:10px; }
          .more-link { min-height:74px; border-radius:18px; }
          table { min-width:760px; }
        }
        @media (max-width:560px) {
          main { padding:16px 12px calc(102px + env(safe-area-inset-bottom)); }
          .top-tools, .actions { justify-content:flex-start; }
          .topbar { margin-bottom:14px; }
          .topbar .actions { margin-top:12px; }
          h1 { font-size:30px; line-height:1.06; }
          h2 { font-size:21px; }
          .eyebrow { font-size:10px; }
          .button, button { min-height:38px; border-radius:12px; }
          input, textarea, select { min-height:44px; border-radius:12px; }
          .metric-row > div:first-child { font-size:11px; }
          .status { padding:5px 8px; font-size:10px; }
        }
        @media (max-width:390px) {
          .grid { grid-template-columns:1fr; }
          header .brand-mark { width:44px; height:50px; }
          .top-tools .button { padding:0 9px; }
        }
      </style>
    </head>
    <body>
      <div class="app-shell">
        <aside class="sidebar" aria-label="Admin menu">
          <a class="sidebar-brand" href="/admin" aria-label="Meat For Free admin">
            ${brandMarkSvg("brand-mark")}
          </a>
          <nav class="menu">
            <p class="menu-title">Beheer</p>
            ${menu.slice(0, 5).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Controle</p>
            ${menu.slice(5, 9).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Acties</p>
            ${menu.slice(9).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
          </nav>
        </aside>
        <div class="content">
          <header>
            <a class="brand" href="/admin" aria-label="Meat For Free admin">
              ${brandMarkSvg("brand-mark")}
            </a>
            <div class="top-tools">
              <a class="button button--ghost" href="/api/draws/live">${icon("FileJson")}Live API</a>
              <a class="button button--ghost" href="/admin/embed">${icon("ExternalLink")}Embed</a>
              <a class="button button--gold" href="/admin/new-draw">${icon("Plus")}Nieuwe winactie</a>
            </div>
          </header>
          <main>${body}</main>
        </div>
        <nav class="mobile-tabbar" aria-label="Snelle mobiele navigatie">
          ${mobileTabs.map(([key, href, iconName, label]) => mobileTabLink(active, key, href, iconName, label)).join("")}
        </nav>
      </div>
    </body>
  </html>`;
}

function menuLink(active, key, href, iconName, label) {
  return `<a class="menu-link${active === key ? " menu-link--active" : ""}" href="${href}">
    <span class="menu-left"><span class="menu-icon">${icon(iconName)}</span>${escapeHtml(label)}</span>
  </a>`;
}

function mobileTabLink(active, key, href, iconName, label) {
  const primaryKeys = new Set(["overzicht", "analyse", "winacties", "orders"]);
  const isActive = active === key || (key === "meer" && !primaryKeys.has(active));
  return `<a class="mobile-tab-link${isActive ? " mobile-tab-link--active" : ""}" href="${href}">
    ${icon(iconName)}<span class="mobile-tab-label">${escapeHtml(label)}</span>
  </a>`;
}

function titleBlock(eyebrow, title, copy = "") {
  return `<div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${copy ? `<p class="muted" style="margin-top:8px">${escapeHtml(copy)}</p>` : ""}</div>`;
}

function topbar(eyebrow, title, copy, actions = "") {
  return `<div class="topbar">${titleBlock(eyebrow, title, copy)}<div class="actions">${actions}</div></div>`;
}

async function createManualEntry({ drawId, email, firstName, lastName, reason }) {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(drawId);
  if (!draw) throw new Error("Winactie niet gevonden.");
  if (!["DRAFT", "LIVE"].includes(draw.status)) throw new Error("Handmatige loten kunnen alleen op concept of live winacties.");
  const cleanEmail = textParam(email).toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Vul een geldig e-mailadres in.");

  const customer = await getOrCreateCustomer({
    email: cleanEmail,
    firstName: textParam(firstName),
    lastName: textParam(lastName)
  });
  const entry = {
    id: id("entry"),
    entry_number: makeEntryNumber("MFF"),
    draw_id: draw.id,
    customer_id: customer.id,
    order_id: null,
    source: "MANUAL",
    status: "ACTIVE",
    reason: textParam(reason) || "Handmatig toegevoegd door admin.",
    created_at: nowIso()
  };
  db.prepare(`
    INSERT INTO lottery_entries (id, entry_number, draw_id, customer_id, order_id, source, status, reason, created_at)
    VALUES (@id, @entry_number, @draw_id, @customer_id, @order_id, @source, @status, @reason, @created_at)
  `).run(entry);
  db.prepare("UPDATE customers SET total_entries = total_entries + 1, updated_at = ? WHERE id = ?").run(nowIso(), customer.id);
  await syncCustomerDashboardMetafields(customer);
  return { draw, customer, entry };
}

async function setEntryStatus(entryId, status, reason) {
  if (!["ACTIVE", "VOID"].includes(status)) throw new Error("Deze status kan niet handmatig gezet worden.");
  const entry = db.prepare("SELECT * FROM lottery_entries WHERE id = ?").get(entryId);
  if (!entry) throw new Error("Lot niet gevonden.");
  if (entry.status === "WINNER") throw new Error("Een winnend lot kan niet met deze snelle actie aangepast worden.");
  if (entry.status === status) return { entry, changed: false };
  const previousStatus = entry.status;

  db.prepare("UPDATE lottery_entries SET status = ?, reason = ? WHERE id = ?").run(status, textParam(reason), entry.id);
  const delta = previousStatus === "VOID" && status === "ACTIVE" ? 1 : previousStatus === "ACTIVE" && status === "VOID" ? -1 : 0;
  if (entry.customer_id && delta !== 0) {
    db.prepare("UPDATE customers SET total_entries = MAX(0, total_entries + ?), updated_at = ? WHERE id = ?").run(delta, nowIso(), entry.customer_id);
    await syncCustomerDashboardMetafields(entry.customer_id);
  }
  return { entry: { ...entry, status, previousStatus }, changed: true };
}

function getMetrics() {
  const rule = getLotteryRule();
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_entries,
      SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_entries,
      SUM(CASE WHEN status = 'WINNER' THEN 1 ELSE 0 END) AS winners,
      SUM(CASE WHEN status = 'VOID' THEN 1 ELSE 0 END) AS void_entries,
      SUM(CASE WHEN source = 'FREE_ENTRY' THEN 1 ELSE 0 END) AS free_entries,
      SUM(CASE WHEN source = 'ORDER_THRESHOLD' THEN 1 ELSE 0 END) AS order_entries,
      COUNT(DISTINCT customer_id) AS participating_customers
    FROM lottery_entries
  `).get();
  const orderTotals = db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(total_cents) AS gross_cents,
      AVG(total_cents) AS avg_cents,
      SUM(CASE WHEN total_cents >= ? THEN 1 ELSE 0 END) AS eligible_orders
    FROM orders
  `).get(rule.LOT_ORDER_MINIMUM_CENTS);
  const liveDraws = db.prepare("SELECT COUNT(*) AS count FROM lottery_draws WHERE status = 'LIVE'").get().count;
  const recentEntries = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE datetime(created_at) >= datetime('now', '-7 days')").get().count;
  const todayOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE date(created_at) = date('now')").get().count;
  const activeLiveEntries = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    WHERE e.status = 'ACTIVE' AND d.status = 'LIVE'
  `).get().count;
  const eligibleWithoutEntry = db.prepare(`
    SELECT COUNT(*) AS count
    FROM orders o
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    WHERE o.total_cents >= ? AND e.id IS NULL
  `).get(rule.LOT_ORDER_MINIMUM_CENTS).count;
  const liveDrawsWithoutEntries = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
      AND NOT EXISTS (SELECT 1 FROM lottery_entries e WHERE e.draw_id = d.id)
  `).get().count;
  return {
    totals,
    orderTotals,
    liveDraws,
    recentEntries,
    todayOrders,
    activeLiveEntries,
    eligibleWithoutEntry,
    liveDrawsWithoutEntries
  };
}

function funnelMetrics() {
  const rule = getLotteryRule();
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN total_cents >= ? THEN 1 ELSE 0 END) AS eligible_orders
    FROM orders
  `).get(rule.LOT_ORDER_MINIMUM_CENTS);
  const ordersWithEntries = db.prepare(`
    SELECT COUNT(DISTINCT order_id) AS count
    FROM lottery_entries
    WHERE order_id IS NOT NULL
  `).get().count;
  const winningOrders = db.prepare(`
    SELECT COUNT(DISTINCT order_id) AS count
    FROM lottery_entries
    WHERE order_id IS NOT NULL AND status = 'WINNER'
  `).get().count;
  const freeEntries = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries
    WHERE source = 'FREE_ENTRY'
  `).get().count;
  return {
    totalOrders: Number(summary.total_orders || 0),
    eligibleOrders: Number(summary.eligible_orders || 0),
    ordersWithEntries: Number(ordersWithEntries || 0),
    winningOrders: Number(winningOrders || 0),
    freeEntries: Number(freeEntries || 0)
  };
}

function suspiciousIpRows(limit = 8) {
  return db.prepare(`
    SELECT
      fc.ip_hash,
      COUNT(*) AS claim_count,
      COUNT(DISTINCT fc.draw_id) AS draw_count,
      COUNT(DISTINCT fc.email) AS email_count,
      MAX(fc.created_at) AS last_seen
    FROM free_entry_claims fc
    GROUP BY fc.ip_hash
    HAVING COUNT(DISTINCT fc.draw_id) >= 2 OR COUNT(DISTINCT fc.email) >= 2
    ORDER BY draw_count DESC, email_count DESC, claim_count DESC, last_seen DESC
    LIMIT ?
  `).all(limit).map((row) => {
    const drawCount = Number(row.draw_count || 0);
    const emailCount = Number(row.email_count || 0);
    const claimCount = Number(row.claim_count || 0);
    const riskScore = (drawCount >= 3 ? 2 : 0) + (emailCount >= 2 ? 2 : 0) + (claimCount >= 5 ? 1 : 0);
    return {
      ...row,
      risk_score: riskScore,
      risk_label: riskScore >= 4 ? "Hoog" : riskScore >= 2 ? "Middel" : "Laag"
    };
  });
}

function sourceQualityRows() {
  return db.prepare(`
    SELECT
      e.source,
      COUNT(*) AS total_entries,
      SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_entries,
      SUM(CASE WHEN e.status = 'WINNER' THEN 1 ELSE 0 END) AS winners,
      SUM(CASE WHEN e.status = 'VOID' THEN 1 ELSE 0 END) AS void_entries,
      COUNT(DISTINCT e.customer_id) AS customers,
      COUNT(DISTINCT e.order_id) AS orders
    FROM lottery_entries e
    GROUP BY e.source
    ORDER BY total_entries DESC
  `).all();
}

function drawPerformanceRows(limit = 12) {
  return db.prepare(`
    SELECT
      d.id,
      d.title,
      d.status,
      d.prize_name,
      d.starts_at,
      d.draw_at,
      COUNT(e.id) AS entry_count,
      COUNT(DISTINCT e.customer_id) AS customer_count,
      SUM(CASE WHEN e.source = 'FREE_ENTRY' THEN 1 ELSE 0 END) AS free_entries,
      SUM(CASE WHEN e.source = 'ORDER_THRESHOLD' THEN 1 ELSE 0 END) AS order_entries,
      SUM(CASE WHEN e.status = 'VOID' THEN 1 ELSE 0 END) AS void_entries,
      we.entry_number AS winner_entry_number,
      wc.email AS winner_email
    FROM lottery_draws d
    LEFT JOIN lottery_entries e ON e.draw_id = d.id
    LEFT JOIN lottery_entries we ON we.id = d.winner_entry_id
    LEFT JOIN customers wc ON wc.id = we.customer_id
    GROUP BY d.id
    ORDER BY COALESCE(d.starts_at, d.created_at) DESC
    LIMIT ?
  `).all(limit);
}

function sourceSignal(row) {
  const total = Number(row.total_entries || 0);
  const voidRate = total ? Number(row.void_entries || 0) / total : 0;
  const entriesPerCustomer = Number(row.customers || 0) ? total / Number(row.customers || 1) : 0;
  if (voidRate >= 0.12) return ["Controle", "Veel ongeldige loten"];
  if (row.source === "FREE_ENTRY" && entriesPerCustomer >= 1.8) return ["Monitor", "Let op herhaalde gratis deelname"];
  if (entriesPerCustomer >= 4) return ["Monitor", "Veel loten per deelnemer"];
  return ["Goed", "Geen afwijkend patroon"];
}

function drawSignal(row) {
  const total = Number(row.entry_count || 0);
  if (row.status === "LIVE" && total === 0) return ["Actie", "Live zonder loten"];
  if (row.status === "DRAWN" && !row.winner_entry_number) return ["Actie", "Getrokken status zonder winnaar"];
  if (total > 0 && Number(row.customer_count || 0) === 0) return ["Controle", "Loten zonder klantkoppeling"];
  return ["Goed", "Normaal"];
}

function kpiGrid(items) {
  const tints = ["card--tint-0", "card--tint-1", "card--tint-2", "card--tint-3"];
  return `<section class="grid" aria-label="Kerncijfers">${items.map((item, index) => `<div class="card ${tints[index % tints.length]}">
    <div class="card-head"><p class="muted">${escapeHtml(item.label)}</p><span class="card-icon">${icon(item.icon || "Activity")}</span></div>
    <div class="stat">${item.value}</div>
    <p>${escapeHtml(item.help)}</p>
  </div>`).join("")}</section>`;
}

function trendChart() {
  const entryMap = new Map(
    db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS count
      FROM lottery_entries
      WHERE datetime(created_at) >= datetime('now', '-13 days')
      GROUP BY day
      ORDER BY day ASC
    `).all().map((row) => [row.day, Number(row.count || 0)])
  );
  const orderMap = new Map(
    db.prepare(`
      SELECT date(created_at) AS day,
        SUM(CASE WHEN total_cents >= ? THEN 1 ELSE 0 END) AS eligible_count
      FROM orders
      WHERE datetime(created_at) >= datetime('now', '-13 days')
      GROUP BY day
      ORDER BY day ASC
    `).all(getLotteryRule().LOT_ORDER_MINIMUM_CENTS).map((row) => [row.day, Number(row.eligible_count || 0)])
  );
  const days = Array.from({ length: 14 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (13 - offset));
    const day = date.toISOString().slice(0, 10);
    return {
      day,
      label: day.slice(5),
      entries: entryMap.get(day) || 0,
      orders: orderMap.get(day) || 0
    };
  });
  const max = Math.max(1, ...days.flatMap((row) => [row.entries, row.orders]));
  const width = 720;
  const height = 240;
  const paddingX = 20;
  const paddingTop = 16;
  const paddingBottom = 26;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;
  const stepX = days.length > 1 ? innerWidth / (days.length - 1) : innerWidth;
  const y = (value) => paddingTop + innerHeight - (value / max) * innerHeight;
  const areaPath = (key) => {
    const points = days.map((row, index) => `${paddingX + (index * stepX)},${y(row[key])}`);
    return `M ${paddingX} ${paddingTop + innerHeight} L ${points.join(" L ")} L ${paddingX + innerWidth} ${paddingTop + innerHeight} Z`;
  };
  const linePath = (key) => days.map((row, index) => `${index === 0 ? "M" : "L"} ${paddingX + (index * stepX)} ${y(row[key])}`).join(" ");
  const latest = days[days.length - 1];

  return `<div class="chart-shell" aria-label="Trend van loten en geschikte orders">
    <div class="chart-wrap">
      <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Lijnchart met loten en geschikte orders over 14 dagen">
        ${Array.from({ length: 5 }, (_, index) => {
          const lineY = paddingTop + ((innerHeight / 4) * index);
          return `<line x1="${paddingX}" y1="${lineY}" x2="${width - paddingX}" y2="${lineY}" stroke="#dfdacd" stroke-width="1" />`;
        }).join("")}
        <path d="${areaPath("orders")}" fill="rgba(148,190,70,.14)"></path>
        <path d="${areaPath("entries")}" fill="rgba(95,141,62,.12)"></path>
        <path d="${linePath("orders")}" fill="none" stroke="${brandPalette.sage}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="${linePath("entries")}" fill="none" stroke="${brandPalette.moss}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
        ${days.map((row, index) => {
          const x = paddingX + (index * stepX);
          return `<circle cx="${x}" cy="${y(row.orders)}" r="3.5" fill="${brandPalette.sage}"></circle>
            <circle cx="${x}" cy="${y(row.entries)}" r="4" fill="${brandPalette.moss}"></circle>
            ${index < days.length - 1 ? "" : `<rect x="${x - 32}" y="${Math.min(y(row.entries), y(row.orders)) - 34}" width="92" height="28" rx="8" fill="#fffdf8" stroke="#d9d4c7"></rect>
            <text x="${x - 24}" y="${Math.min(y(row.entries), y(row.orders)) - 16}" font-size="11" font-weight="800" fill="${brandPalette.ink}">${row.entries} loten</text>`}`;
        }).join("")}
        ${days.map((row, index) => {
          const x = paddingX + (index * stepX);
          return `<text x="${x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="${brandPalette.muted}">${escapeHtml(row.label)}</text>`;
        }).join("")}
      </svg>
    </div>
    <div class="chart-meta">
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-dot legend-dot--entries"></span>Loten per dag</span>
        <span class="legend-item"><span class="legend-dot legend-dot--orders"></span>Geschikte orders per dag</span>
      </div>
      <p class="chart-note">Vandaag: ${latest.entries} loten en ${latest.orders} geschikte orders.</p>
    </div>
  </div>`;
}

function funnelPanel(metrics) {
  const rows = [
    ["Orders totaal", metrics.totalOrders, 100],
    ["Kwalificerende orders", metrics.eligibleOrders, ratio(metrics.eligibleOrders, metrics.totalOrders || 1)],
    ["Orders met lot", metrics.ordersWithEntries, ratio(metrics.ordersWithEntries, metrics.eligibleOrders || 1)],
    ["Winnende orders", metrics.winningOrders, ratio(metrics.winningOrders, metrics.ordersWithEntries || 1)]
  ];
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Funnel</p><h2>Van order naar winnaar</h2></div></div>
    <div class="stack">
      ${rows.map(([label, value, width]) => `<div class="metric-row">
        <div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
        <div class="bar"><span style="width:${width}%"></span></div>
      </div>`).join("")}
    </div>
    <p class="helper">Gratis deelnames lopen apart en staan nu op ${metrics.freeEntries} loten.</p>
  </div>`;
}

function breakdownPanel(title, rows, total, keyName = "status") {
  return `<div class="panel panel-pad">
    <div class="panel-title"><h2>${escapeHtml(title)}</h2></div>
    <div class="stack">
      ${rows.length ? rows.map((row) => `<div class="metric-row">
        <div><span>${escapeHtml(statusLabel(row[keyName]))}</span><strong>${row.count}</strong></div>
        <div class="bar"><span style="width:${ratio(row.count, total)}%"></span></div>
      </div>`).join("") : `<p class="empty">Nog geen data.</p>`}
    </div>
  </div>`;
}

function sourceQualityPanel(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.total_entries || 0), 0);
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Bronkwaliteit</p><h2>Welke deelnamebron draagt wat bij?</h2></div></div>
    <div class="stack">
      ${rows.length ? rows.map((row) => {
        const [badge, note] = sourceSignal(row);
        return `<div class="metric-row">
          <div><span>${escapeHtml(statusLabel(row.source))}</span><strong>${row.total_entries || 0} loten</strong></div>
          <div class="bar"><span style="width:${ratio(row.total_entries, total)}%"></span></div>
          <p class="helper">${escapeHtml(note)} · ${row.customers || 0} deelnemers · ${row.orders || 0} orders · <strong>${escapeHtml(badge)}</strong></p>
        </div>`;
      }).join("") : `<p class="empty">Nog geen brondata.</p>`}
    </div>
  </div>`;
}

function sourceQualityTable(rows) {
  return `<table>
    <thead><tr><th>Bron</th><th>Loten</th><th>Actief</th><th>Winnaars</th><th>Ongeldig</th><th>Deelnemers</th><th>Signaal</th></tr></thead>
    <tbody>${rows.length ? rows.map((row) => {
      const [badge, note] = sourceSignal(row);
      return `<tr>
        <td><strong>${escapeHtml(statusLabel(row.source))}</strong><span class="muted">${escapeHtml(row.source)}</span></td>
        <td>${row.total_entries || 0}</td>
        <td>${row.active_entries || 0}</td>
        <td>${row.winners || 0}</td>
        <td>${row.void_entries || 0}</td>
        <td>${row.customers || 0}</td>
        <td>${statusBadge(badge)}<br><span class="muted">${escapeHtml(note)}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty">Nog geen brondata.</div></td></tr>`}</tbody>
  </table>`;
}

function drawPerformanceTable(rows) {
  return `<table>
    <thead><tr><th>Winactie</th><th>Status</th><th>Loten</th><th>Deelnemers</th><th>Mix</th><th>Winnaar</th><th>Signaal</th></tr></thead>
    <tbody>${rows.length ? rows.map((row) => {
      const [badge, note] = drawSignal(row);
      return `<tr>
        <td><strong>${escapeHtml(row.title)}</strong><span class="muted">${escapeHtml(row.prize_name || "-")}</span></td>
        <td>${statusBadge(row.status)}</td>
        <td>${row.entry_count || 0}<br><span class="muted">${row.void_entries || 0} ongeldig</span></td>
        <td>${row.customer_count || 0}</td>
        <td><span class="muted">Order</span> ${row.order_entries || 0}<br><span class="muted">Gratis</span> ${row.free_entries || 0}</td>
        <td>${escapeHtml(row.winner_email || row.winner_entry_number || "-")}</td>
        <td>${statusBadge(badge)}<br><span class="muted">${escapeHtml(note)}</span></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty">Nog geen winacties.</div></td></tr>`}</tbody>
  </table>`;
}

function auditRows(limit = 10) {
  return db.prepare(`
    SELECT *
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function complianceAlerts(metrics) {
  const alerts = [];
  const blockedClaimCount = db.prepare("SELECT COUNT(*) AS count FROM free_entry_claims").get().count;
  const multiDrawIpClaims = db.prepare(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT ip_hash
      FROM free_entry_claims
      GROUP BY ip_hash
      HAVING COUNT(DISTINCT draw_id) >= 3
    )
  `).get().count;
  if (metrics.eligibleWithoutEntry > 0) {
    alerts.push(["PackageSearch", `${metrics.eligibleWithoutEntry} geschikte orders zonder lot`, "Voer ordersynchronisatie uit.", "/admin/sync"]);
  }
  if (metrics.liveDrawsWithoutEntries > 0) {
    alerts.push(["Gift", `${metrics.liveDrawsWithoutEntries} live winactie(s) zonder loten`, "Controleer of de actie echt al live moet staan.", "/admin/winacties"]);
  }
  if (multiDrawIpClaims > 0) {
    alerts.push(["ShieldAlert", `${multiDrawIpClaims} IP-hash(es) actief in 3+ winacties`, "Controleer gratis deelnamepatronen.", "/admin/compliance"]);
  }
  if (!alerts.length) {
    alerts.push(["ShieldCheck", "Geen directe compliance-acties", `${blockedClaimCount} gratis deelnameclaims worden met IP-hash bewaakt.`, "/admin/compliance"]);
  }
  return alerts;
}

function entryFilter(req) {
  const filter = {
    q: textParam(req.query.q),
    drawId: textParam(req.query.drawId),
    drawStatus: textParam(req.query.drawStatus),
    entryStatus: textParam(req.query.entryStatus),
    source: textParam(req.query.source),
    hasOrder: textParam(req.query.hasOrder),
    from: isoDateParam(req.query.from),
    to: isoDateParam(req.query.to)
  };
  const where = [];
  const params = [];
  if (filter.q) {
    where.push("(e.entry_number LIKE ? OR c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR o.order_name LIKE ? OR d.title LIKE ?)");
    const like = `%${filter.q}%`;
    params.push(like, like, like, like, like, like);
  }
  if (filter.drawStatus) {
    where.push("d.status = ?");
    params.push(filter.drawStatus);
  }
  if (filter.drawId) {
    where.push("d.id = ?");
    params.push(filter.drawId);
  }
  if (filter.entryStatus) {
    where.push("e.status = ?");
    params.push(filter.entryStatus);
  }
  if (filter.source) {
    where.push("e.source = ?");
    params.push(filter.source);
  }
  if (filter.hasOrder === "yes") {
    where.push("e.order_id IS NOT NULL");
  }
  if (filter.hasOrder === "no") {
    where.push("e.order_id IS NULL");
  }
  if (filter.from) {
    where.push("date(e.created_at) >= date(?)");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("date(e.created_at) <= date(?)");
    params.push(filter.to);
  }
  return { filter, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function orderFilter(req) {
  const filter = {
    orderQ: textParam(req.query.orderQ),
    orderStatus: textParam(req.query.orderStatus),
    eligible: textParam(req.query.eligible),
    lotState: textParam(req.query.lotState),
    minTotal: textParam(req.query.minTotal),
    maxTotal: textParam(req.query.maxTotal),
    from: isoDateParam(req.query.from),
    to: isoDateParam(req.query.to)
  };
  const rule = getLotteryRule();
  const minCents = moneyParamToCents(filter.minTotal);
  const maxCents = moneyParamToCents(filter.maxTotal);
  const where = [];
  const params = [];
  if (filter.orderQ) {
    where.push("(o.order_name LIKE ? OR o.email LIKE ? OR c.email LIKE ?)");
    const like = `%${filter.orderQ}%`;
    params.push(like, like, like);
  }
  if (filter.orderStatus) {
    where.push("o.financial_status = ?");
    params.push(filter.orderStatus);
  }
  if (filter.eligible === "yes") {
    where.push("o.total_cents >= ?");
    params.push(rule.LOT_ORDER_MINIMUM_CENTS);
  }
  if (filter.eligible === "no") {
    where.push("o.total_cents < ?");
    params.push(rule.LOT_ORDER_MINIMUM_CENTS);
  }
  if (filter.lotState === "with") {
    where.push("EXISTS (SELECT 1 FROM lottery_entries e2 WHERE e2.order_id = o.id)");
  }
  if (filter.lotState === "without") {
    where.push("NOT EXISTS (SELECT 1 FROM lottery_entries e2 WHERE e2.order_id = o.id)");
  }
  if (minCents !== null) {
    where.push("o.total_cents >= ?");
    params.push(minCents);
  }
  if (maxCents !== null) {
    where.push("o.total_cents <= ?");
    params.push(maxCents);
  }
  if (filter.from) {
    where.push("date(o.created_at) >= date(?)");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("date(o.created_at) <= date(?)");
    params.push(filter.to);
  }
  return { filter, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function customerFilter(req) {
  const filter = {
    q: textParam(req.query.q),
    minEntries: textParam(req.query.minEntries),
    winnersOnly: textParam(req.query.winnersOnly),
    linkedOnly: textParam(req.query.linkedOnly)
  };
  const where = [];
  const having = [];
  const params = [];
  if (filter.q) {
    where.push("(c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.shopify_customer_id LIKE ?)");
    const like = `%${filter.q}%`;
    params.push(like, like, like, like);
  }
  const minEntries = Number(filter.minEntries || 0);
  if (Number.isFinite(minEntries) && minEntries > 0) {
    having.push("COUNT(e.id) >= ?");
    params.push(minEntries);
  }
  if (filter.winnersOnly === "true") {
    having.push("SUM(CASE WHEN e.status = 'WINNER' THEN 1 ELSE 0 END) > 0");
  }
  if (filter.linkedOnly === "true") {
    where.push("c.shopify_customer_id IS NOT NULL AND c.shopify_customer_id != ''");
  }
  return {
    filter,
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    havingSql: having.length ? `HAVING ${having.join(" AND ")}` : "",
    params
  };
}

adminRouter.get("/", (_req, res) => {
  const metrics = getMetrics();
  const funnel = funnelMetrics();
  const rule = getLotteryRule();
  const { totals, orderTotals } = metrics;
  const sourceRows = db.prepare("SELECT source, COUNT(*) AS count FROM lottery_entries GROUP BY source ORDER BY count DESC").all();
  const statusRows = db.prepare("SELECT status, COUNT(*) AS count FROM lottery_entries GROUP BY status ORDER BY count DESC").all();
  const latestDraws = db.prepare(`
    SELECT d.*, COUNT(e.id) AS entry_count
    FROM lottery_draws d
    LEFT JOIN lottery_entries e ON e.draw_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT 5
  `).all();
  const opsItems = [
    ["PackageSearch", `${metrics.eligibleWithoutEntry} geschikte orders zonder lot`, metrics.eligibleWithoutEntry ? "Ordersynchronisatie controleren" : "Geen actie nodig", metrics.eligibleWithoutEntry ? "Controle" : "Goed"],
    ["Gift", `${metrics.liveDraws} live winactie(s)`, metrics.liveDrawsWithoutEntries ? `${metrics.liveDrawsWithoutEntries} zonder loten` : `${metrics.activeLiveEntries} actieve loten`, metrics.liveDraws ? "Live" : "Maak"],
    ["ShieldCheck", `${percent(totals.free_entries || 0, totals.total_entries || 0)} gratis deelname`, "Gratis route zichtbaar houden voor compliance", "Monitoren"]
  ];

  res.send(page("Overzicht | Meat For Free", "overzicht", `
    ${topbar("Overzicht", "Sturing op loten, omzet en winacties.", "Eerste scherm voor dagelijkse controle: wat loopt, wat groeit, wat vraagt actie.", `<a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>`)}
    ${kpiGrid([
      { label: "Actieve loten", value: metrics.activeLiveEntries || 0, help: `${totals.total_entries || 0} loten totaal in de database.`, icon: "Tickets" },
      { label: "Deelnemers", value: totals.participating_customers || 0, help: `${percent(totals.free_entries || 0, totals.total_entries || 0)} via gratis deelname.`, icon: "Users" },
      { label: "Geschikte orders", value: percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0), help: `${orderTotals.eligible_orders || 0} orders volgens ${ruleLabel(rule)}.`, icon: "Target" },
      { label: "Omzet in app", value: formatEuro(orderTotals.gross_cents || 0), help: `${formatEuro(Math.round(orderTotals.avg_cents || 0))} gemiddelde orderwaarde.`, icon: "TrendingUp" }
    ])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Trend</p><h2>Loten versus orderkans</h2></div><span class="status status--active">${metrics.recentEntries} laatste 7 dagen</span></div>
        ${trendChart()}
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Actielijst</p><h2>Vandaag belangrijk</h2></div></div>
        <div class="stack">
          ${opsItems.map(([iconName, title, body, badge]) => `<div class="ops-item"><span class="ops-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${escapeHtml(badge)}</span></div>`).join("")}
        </div>
      </div>
    </section>
    <section class="grid grid-2">
      ${funnelPanel(funnel)}
      ${breakdownPanel("Loten per bron", sourceRows, totals.total_entries || 0, "source")}
    </section>
    <section class="grid grid-2">
      ${breakdownPanel("Loten per status", statusRows, totals.total_entries || 0)}
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Controle</p><h2>Belangrijkste coverage</h2></div></div>
        <div class="stack">
          <div class="ops-item"><span class="ops-icon">${icon("Target")}</span><span><strong>${funnel.eligibleOrders} orders kwalificeren</strong><br><span class="muted">Op basis van ${escapeHtml(ruleLabel(rule))}.</span></span><span class="status">Basis</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("Tickets")}</span><span><strong>${funnel.ordersWithEntries} orders hebben loten</strong><br><span class="muted">Coverage binnen ordergebonden deelname.</span></span><span class="status">${funnel.ordersWithEntries === funnel.eligibleOrders ? "Goed" : "Check"}</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("Gift")}</span><span><strong>${funnel.freeEntries} gratis loten actief</strong><br><span class="muted">Gebruik dit om verhouding aankoop versus gratis te monitoren.</span></span><span class="status">Monitor</span></div>
          <a class="ops-item" href="/admin/analyse" style="text-decoration:none"><span class="ops-icon">${icon("ChartNoAxesCombined")}</span><span><strong>Open volledige analyse</strong><br><span class="muted">Bronkwaliteit, winactie-performance en funnel samen.</span></span><span class="status">Analyse</span></a>
        </div>
      </div>
    </section>
    <div class="section-head"><h2>Laatste winacties</h2><a class="button button--ghost" href="/admin/winacties">Alle winacties</a></div>
    <div class="panel">${drawTable(latestDraws)}</div>
  `));
});

adminRouter.get("/analyse", (_req, res) => {
  const metrics = getMetrics();
  const funnel = funnelMetrics();
  const sourceRows = sourceQualityRows();
  const drawRows = drawPerformanceRows(12);
  const suspiciousIps = suspiciousIpRows(6);
  const monitorSources = sourceRows.filter((row) => sourceSignal(row)[0] !== "Goed").length;
  const actionDraws = drawRows.filter((row) => drawSignal(row)[0] !== "Goed").length;
  const highRiskIps = suspiciousIps.filter((row) => row.risk_label === "Hoog").length;
  const { totals, orderTotals } = metrics;
  const totalEntries = Number(totals.total_entries || 0);
  const actionItems = [
    ["PackageSearch", `${metrics.eligibleWithoutEntry} geschikte orders zonder lot`, metrics.eligibleWithoutEntry ? "Synchronisatie draaien en daarna opnieuw controleren." : "Orderdekking is op dit moment schoon.", "/admin/orders", metrics.eligibleWithoutEntry ? "Actie" : "Goed"],
    ["ChartNoAxesCombined", `${monitorSources} bron(nen) met monitor-signaal`, monitorSources ? "Bekijk bronkwaliteit voordat je verkeer opschaalt." : "Bronmix toont geen directe afwijkingen.", "/admin/analyse", monitorSources ? "Monitor" : "Goed"],
    ["Gift", `${actionDraws} winactie(s) met aandachtspunt`, actionDraws ? "Controleer live acties zonder loten of status zonder winnaar." : "Winactie-performance oogt stabiel.", "/admin/winacties", actionDraws ? "Controle" : "Goed"],
    ["ShieldAlert", `${highRiskIps} hoge IP-risicohash(es)`, highRiskIps ? "Gratis deelnamepatronen direct nalopen." : "Geen hoog risico in de top IP-hashes.", "/admin/compliance", highRiskIps ? "Actie" : "Goed"]
  ];

  res.send(page("Analyse | Meat For Free", "analyse", `
    ${topbar("Analyse", "Funnel, bronkwaliteit en risico's.", "Gebruik deze pagina voor schaalbare beslissingen: waar komt deelname vandaan, wat converteert, en waar zit risico.", `<a class="button button--ghost" href="/admin/compliance">${icon("ShieldCheck")}Compliance</a>`)}
    ${kpiGrid([
      { label: "Orderdekking", value: percent(funnel.ordersWithEntries, funnel.eligibleOrders || 0), help: `${funnel.ordersWithEntries} van ${funnel.eligibleOrders} kwalificerende orders hebben loten.`, icon: "Target" },
      { label: "Gratis aandeel", value: percent(totals.free_entries || 0, totalEntries), help: `${totals.free_entries || 0} gratis loten op ${totalEntries} totaal.`, icon: "Gift" },
      { label: "Bronnen monitoren", value: monitorSources, help: "Bronnen met afwijkende verhouding of invalidatie.", icon: "ScanSearch" },
      { label: "Winactie-checks", value: actionDraws, help: "Recente acties met operationeel aandachtspunt.", icon: "Gauge" }
    ])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Trend</p><h2>Nieuwe loten versus orderkans</h2></div><span class="status">${metrics.recentEntries} laatste 7 dagen</span></div>
        ${trendChart()}
      </div>
      ${sourceQualityPanel(sourceRows)}
    </section>
    <section class="grid grid-2">
      ${funnelPanel(funnel)}
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Beslispunten</p><h2>Wat vraagt aandacht?</h2></div></div>
        <div class="stack">${actionItems.map(([iconName, title, body, href, badge]) => `<a class="ops-item" href="${href}" style="text-decoration:none"><span class="ops-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${escapeHtml(badge)}</span></a>`).join("")}</div>
      </div>
    </section>
    <div class="section-head"><h2>Bronkwaliteit</h2><span class="muted">Niet meer data, alleen data die iets zegt.</span></div>
    <div class="panel">${sourceQualityTable(sourceRows)}</div>
    <div class="section-head"><h2>Winactie-performance</h2><span class="muted">Laatste 12 acties met bronmix en signaal.</span></div>
    <div class="panel">${drawPerformanceTable(drawRows)}</div>
    <div class="section-head"><h2>Risico uit gratis deelname</h2><a class="button button--ghost" href="/admin/compliance">Volledige compliance</a></div>
    <div class="panel">
      <table>
        <thead><tr><th>IP-hash</th><th>Risico</th><th>Claims</th><th>Winacties</th><th>Emails</th><th>Laatst gezien</th></tr></thead>
        <tbody>${suspiciousIps.length ? suspiciousIps.map((row) => `<tr>
          <td><strong>${escapeHtml(String(row.ip_hash).slice(0, 12))}...</strong><span class="muted">Hash afgekapt</span></td>
          <td>${statusBadge(row.risk_label)}</td>
          <td>${row.claim_count}</td>
          <td>${row.draw_count}</td>
          <td>${row.email_count}</td>
          <td>${escapeHtml(row.last_seen)}</td>
        </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen opvallende IP-hashes.</div></td></tr>`}</tbody>
      </table>
    </div>
  `));
});

adminRouter.get("/menu", (_req, res) => {
  const groups = [
    ["Beheer", [
      ["Loten", "/admin/loten", "Tickets", "Alle deelnamebewijzen en bronnen."],
      ["Orders", "/admin/orders", "ShoppingCart", "Orderwaarde en lottoekenning."],
      ["Deelnemers", "/admin/deelnemers", "Users", "Klanten, winnaars en deelnamewaarde."]
    ]],
    ["Controle", [
      ["Compliance", "/admin/compliance", "ShieldCheck", "Gratis deelname, IP-hashes en audit."],
      ["Synchronisatie", "/admin/sync", "RefreshCw", "Orders en klantdashboards bijwerken."],
      ["Regels", "/admin/regels", "SlidersHorizontal", "Lottoekenning en gratis deelname."]
    ]],
    ["Acties", [
      ["Nieuwe winactie", "/admin/new-draw", "Plus", "Maak een actie aan of zet hem live."],
      ["Embed voorbeeld", "/admin/embed", "ExternalLink", "Controleer de Shopify embed."],
      ["Live API", "/api/draws/live", "FileJson", "Bekijk de live winactie JSON."]
    ]]
  ];

  res.send(page("Meer | Meat For Free", "meer", `
    ${topbar("Navigatie", "Meer beheeropties.", "Alle secundaire pagina's zonder dubbele mobiele menu's.", "")}
    ${groups.map(([title, rows]) => `
      <div class="section-head"><h2>${escapeHtml(title)}</h2></div>
      <section class="more-list">
        ${rows.map(([label, href, iconName, copy]) => `<a class="more-link" href="${href}">
          <span class="ops-icon">${icon(iconName)}</span>
          <span><strong>${escapeHtml(label)}</strong><span class="muted">${escapeHtml(copy)}</span></span>
        </a>`).join("")}
      </section>
    `).join("")}
    <div class="section-head"><h2>Sessie</h2></div>
    <section class="panel panel-pad">
      <form method="post" action="/admin/logout" class="inline-form"><button type="submit">${icon("LogOut")}Uitloggen</button></form>
    </section>
  `));
});

adminRouter.get("/winacties", (req, res) => {
  const filter = drawFilter(req);
  const draws = db.prepare(`
    SELECT d.*, COUNT(e.id) AS entry_count, we.entry_number AS winner_entry_number, wc.email AS winner_email
    FROM lottery_draws d
    LEFT JOIN lottery_entries e ON e.draw_id = d.id
    LEFT JOIN lottery_entries we ON we.id = d.winner_entry_id
    LEFT JOIN customers wc ON wc.id = we.customer_id
    ${filter.whereSql}
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all(...filter.params);
  const rowsByStatus = db.prepare(`
    SELECT d.status AS status, COUNT(*) AS count
    FROM lottery_draws d
    ${filter.whereSql}
    GROUP BY d.status
    ORDER BY count DESC
  `).all(...filter.params);
  const totalEntries = draws.reduce((sum, draw) => sum + Number(draw.entry_count || 0), 0);
  const avgEntries = draws.length ? Math.round(totalEntries / draws.length) : 0;
  const upcoming = draws.filter((draw) => draw.status === "LIVE" || draw.status === "DRAFT").length;
  const withWinner = draws.filter((draw) => draw.winner_entry_number).length;

  res.send(page("Winacties | Meat For Free", "winacties", `
    ${topbar("Winacties", "Beheer alle winacties.", "Maak acties aan, pas prijzen of timing aan, zet acties live en trek winnaars.", `<a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>`)}
    ${kpiGrid([
      { label: "Winacties", value: draws.length, help: "Binnen de huidige filters.", icon: "Gift" },
      { label: "Loten in selectie", value: totalEntries, help: `${avgEntries} gemiddeld per winactie.`, icon: "Tickets" },
      { label: "Open of live", value: upcoming, help: "Nog operationeel relevant.", icon: "Activity" },
      { label: "Met winnaar", value: withWinner, help: "Acties die volledig zijn afgerond.", icon: "BadgeCheck" }
    ])}
    <section class="filters">
      <form method="get" action="/admin/winacties" class="filter-grid">
        <label class="wide">Zoek winactie<input name="q" value="${escapeHtml(filter.filter.q)}" placeholder="Titel, slug of prijs"></label>
        <label>Status<select name="status">${option("", filter.filter.status, "Alle statussen")}${drawStatuses.map((item) => option(item, filter.filter.status, statusLabel(item))).join("")}</select></label>
        <label>Winnaar<select name="winnerState">${option("", filter.filter.winnerState, "Met en zonder winnaar")}${option("yes", filter.filter.winnerState, "Met winnaar")}${option("no", filter.filter.winnerState, "Nog zonder winnaar")}</select></label>
        <label>Vanaf<input type="date" name="from" value="${escapeHtml(filter.filter.from)}"></label>
        <label>Tot<input type="date" name="to" value="${escapeHtml(filter.filter.to)}"></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/winacties">Reset</a></div>
      </form>
    </section>
    <section class="grid grid-2">
      ${breakdownPanel("Statusverdeling", rowsByStatus, Math.max(draws.length, 1))}
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Operationeel beeld</h2></div>
        <div class="stack">
          <div class="ops-item"><span class="ops-icon">${icon("Clock3")}</span><span><strong>${upcoming} actie(s) vragen nog opvolging</strong><br><span class="muted">Concepten en live acties blijven bovenaan voor planning en trekking.</span></span><span class="status">Focus</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("TrendingUp")}</span><span><strong>${avgEntries} loten gemiddeld per actie</strong><br><span class="muted">Handig om zwakke acties snel te spotten.</span></span><span class="status">${avgEntries > 0 ? "Data" : "Leeg"}</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("Trophy")}</span><span><strong>${withWinner} actie(s) afgerond</strong><br><span class="muted">Controleer of winnaar, communicatie en export rond zijn.</span></span><span class="status">${withWinner ? "Nazorg" : "Open"}</span></div>
        </div>
      </div>
    </section>
    <div class="panel">${drawTable(draws)}</div>
  `));
});

adminRouter.get("/winacties/:id", (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send(page("Niet gevonden", "winacties", topbar("Niet gevonden", "Winactie niet gevonden.", "", `<a class="button button--ghost" href="/admin/winacties">Terug</a>`)));
  const counts = db.prepare("SELECT status, COUNT(*) AS count FROM lottery_entries WHERE draw_id = ? GROUP BY status").all(draw.id);
  const entries = db.prepare(`
    SELECT e.id, e.entry_number, e.status, e.source, e.reason, e.created_at, c.email, o.order_name
    FROM lottery_entries e
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.draw_id = ?
    ORDER BY e.created_at DESC
    LIMIT 40
  `).all(draw.id);
  const logs = db.prepare(`
    SELECT *
    FROM audit_logs
    WHERE (target_type = 'lottery_draw' AND target_id = ?)
       OR (metadata LIKE ?)
    ORDER BY created_at DESC
    LIMIT 12
  `).all(draw.id, `%"drawId":"${draw.id}"%`);

  res.send(page(`${draw.title} | Meat For Free`, "winacties", `
    ${topbar("Winactie bewerken", draw.title, "Pas inhoud, prijs, timing en status aan.", `<a class="button button--ghost" href="/admin/winacties">Terug</a><a class="button button--ghost" href="/admin/draws/${escapeHtml(draw.id)}/export.csv">Export CSV</a>`)}
    ${kpiGrid([
      { label: "Status", value: statusBadge(draw.status), help: "Huidige publicatiestatus.", icon: "Flag" },
      { label: "Actieve loten", value: counts.find((row) => row.status === "ACTIVE")?.count || 0, help: "Geldige loten voor trekking.", icon: "Tickets" },
      { label: "Winnaars", value: counts.find((row) => row.status === "WINNER")?.count || 0, help: "Normaal 0 of 1.", icon: "Trophy" },
      { label: "Ongeldig", value: counts.find((row) => row.status === "VOID")?.count || 0, help: "Terugbetalingen en annuleringen.", icon: "Ban" }
    ])}
    <section class="panel panel-pad">
      <div class="panel-title"><h2>Instellingen</h2></div>
      ${drawForm(draw, `/admin/winacties/${escapeHtml(draw.id)}/update`, "Wijzigingen opslaan")}
    </section>
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Admin control</p><h2>Handmatig lot toevoegen</h2></div></div>
        <form method="post" action="/admin/winacties/${escapeHtml(draw.id)}/manual-entry">
          <div class="form-grid">
            <label>Email<input name="email" type="email" autocomplete="email" required placeholder="klant@email.nl"></label>
            <label>Voornaam<input name="firstName" autocomplete="given-name" placeholder="Optioneel"></label>
            <label>Achternaam<input name="lastName" autocomplete="family-name" placeholder="Optioneel"></label>
            <label class="wide">Reden<input name="reason" placeholder="Bijv. klantenservice correctie"></label>
          </div>
          <div class="actions" style="justify-content:flex-start;margin-top:14px"><button type="submit">${icon("Plus")}Lot toevoegen</button></div>
        </form>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Audit</p><h2>Laatste wijzigingen</h2></div></div>
        <div class="stack">
          ${logs.length ? logs.map((log) => `<div class="ops-item"><span class="ops-icon">${icon("ClipboardList")}</span><span><strong>${escapeHtml(log.action)}</strong><br><span class="muted">${escapeHtml(log.message || log.created_at)}</span></span><span class="status">${escapeHtml(String(log.created_at || "").slice(0, 10))}</span></div>`).join("") : `<div class="empty">Nog geen auditregels voor deze winactie.</div>`}
        </div>
      </div>
    </section>
    <div class="section-head"><h2>Recente loten</h2>${draw.status === "LIVE" ? `<form class="inline-form" method="post" action="/admin/draws/${escapeHtml(draw.id)}/draw"><button type="submit">Trek winnaar</button></form>` : ""}</div>
    <div class="panel">${entriesTable(entries, { controls: true })}</div>
  `));
});

adminRouter.get("/new-draw", (_req, res) => {
  res.send(page("Nieuwe winactie | Meat For Free", "nieuw", `
    ${topbar("Nieuwe winactie", "Maak een winactie aan.", "Zet hem eerst op concept of direct live wanneer alles klaar staat.", `<a class="button button--ghost" href="/admin/winacties">Terug</a>`)}
    <section class="panel panel-pad">${drawForm(null, "/admin/draws", "Winactie aanmaken")}</section>
  `));
});

adminRouter.post("/draws", urlencoded, async (req, res) => {
  const draw = await createDraw({
    title: textParam(req.body.title),
    slug: textParam(req.body.slug) || undefined,
    prizeName: textParam(req.body.prizeName),
    prizeValue: textParam(req.body.prizeValue),
    description: textParam(req.body.description),
    startsAt: maybeIsoDate(req.body.startsAt),
    endsAt: maybeIsoDate(req.body.endsAt),
    drawAt: maybeIsoDate(req.body.drawAt),
    status: drawStatuses.includes(req.body.status) ? req.body.status : "DRAFT"
  });
  writeAuditLog({
    actor: actor(req),
    action: "WINACTIE_AANGEMAAKT",
    targetType: "lottery_draw",
    targetId: draw.id,
    message: `${draw.title} (${statusLabel(draw.status)})`
  });
  res.redirect("/admin/winacties");
});

adminRouter.post("/winacties/:id/update", urlencoded, (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send("Winactie niet gevonden");
  const status = drawStatuses.includes(req.body.status) ? req.body.status : draw.status;
  db.prepare(`
    UPDATE lottery_draws
    SET title = ?, slug = ?, description = ?, prize_name = ?, prize_value = ?, starts_at = ?, ends_at = ?, draw_at = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(
    textParam(req.body.title),
    textParam(req.body.slug) || draw.slug,
    textParam(req.body.description),
    textParam(req.body.prizeName),
    textParam(req.body.prizeValue),
    maybeIsoDate(req.body.startsAt) || draw.starts_at,
    maybeIsoDate(req.body.endsAt),
    maybeIsoDate(req.body.drawAt),
    status,
    nowIso(),
    draw.id
  );
  writeAuditLog({
    actor: actor(req),
    action: "WINACTIE_AANGEPAST",
    targetType: "lottery_draw",
    targetId: draw.id,
    message: `${textParam(req.body.title)} (${statusLabel(status)})`
  });
  res.redirect(`/admin/winacties/${draw.id}`);
});

adminRouter.post("/winacties/:id/manual-entry", urlencoded, async (req, res) => {
  try {
    const result = await createManualEntry({
      drawId: req.params.id,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      reason: req.body.reason
    });
    writeAuditLog({
      actor: actor(req),
      action: "HANDMATIG_LOT_AANGEMAAKT",
      targetType: "lottery_entry",
      targetId: result.entry.id,
      message: `${result.entry.entry_number} voor ${result.customer.email}`,
      metadata: { drawId: result.draw.id, email: result.customer.email, entryNumber: result.entry.entry_number }
    });
    res.redirect(`/admin/winacties/${result.draw.id}`);
  } catch (error) {
    res.status(400).send(page("Lot toevoegen fout", "winacties", topbar("Actie gestopt", "Kan geen handmatig lot toevoegen.", error.message, `<a class="button button--gold" href="/admin/winacties/${escapeHtml(req.params.id)}">Terug</a>`)));
  }
});

adminRouter.get("/loten", (req, res) => {
  const filter = entryFilter(req);
  const drawOptions = db.prepare("SELECT id, title FROM lottery_draws ORDER BY created_at DESC LIMIT 50").all();
  const entries = db.prepare(`
    SELECT e.id, e.entry_number, e.source, e.status, e.reason, e.created_at, d.title AS draw_title, c.email, o.order_name
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
    ORDER BY e.created_at DESC
    LIMIT 120
  `).all(...filter.params);
  const count = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
  `).get(...filter.params).count;
  const sourceRows = db.prepare(`
    SELECT e.source, COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
    GROUP BY e.source
    ORDER BY count DESC
  `).all(...filter.params);
  const statusRows = db.prepare(`
    SELECT e.status, COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
    GROUP BY e.status
    ORDER BY count DESC
  `).all(...filter.params);
  const uniqueCustomers = db.prepare(`
    SELECT COUNT(DISTINCT e.customer_id) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
  `).get(...filter.params).count;
  const linkedOrders = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${filter.whereSql}
      ${filter.whereSql ? " AND " : "WHERE "}e.order_id IS NOT NULL
  `).get(...filter.params).count;

  res.send(page("Loten | Meat For Free", "loten", `
    ${topbar("Loten", "Controleer alle loten.", "Filter op klant, order, bron, status en periode.", `<a class="button button--ghost" href="/admin/loten">Reset</a>`)}
    ${entryFilters(filter.filter, "/admin/loten", drawOptions)}
    ${kpiGrid([{ label: "Gevonden loten", value: count, help: "Binnen actieve filters.", icon: "Tickets" }, { label: "Unieke deelnemers", value: uniqueCustomers || 0, help: "Klanten achter deze selectie.", icon: "Users" }, { label: "Met order", value: linkedOrders || 0, help: "Direct gekoppeld aan een order.", icon: "ShoppingCart" }, { label: "Getoond", value: entries.length, help: "Maximaal 120 regels.", icon: "ListFilter" }])}
    <section class="grid grid-2">
      ${breakdownPanel("Loten per bron", sourceRows, Math.max(count, 1), "source")}
      ${breakdownPanel("Loten per status", statusRows, Math.max(count, 1))}
    </section>
    <div class="panel">${entriesTable(entries, { controls: true })}</div>
  `));
});

adminRouter.get("/orders", (req, res) => {
  const rule = getLotteryRule();
  const filter = orderFilter(req);
  const orderStatuses = db.prepare("SELECT DISTINCT financial_status AS status FROM orders WHERE financial_status IS NOT NULL AND financial_status != '' ORDER BY financial_status ASC").all();
  const orders = db.prepare(`
    SELECT o.*, c.email AS customer_email, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    ${filter.whereSql}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 120
  `).all(...filter.params);
  const totals = db.prepare(`
    SELECT COUNT(*) AS count, SUM(o.total_cents) AS total_cents, AVG(o.total_cents) AS avg_cents
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${filter.whereSql}
  `).get(...filter.params);
  const eligibleCount = orders.filter((order) => Number(order.total_cents || 0) >= rule.LOT_ORDER_MINIMUM_CENTS).length;
  const withEntries = orders.filter((order) => Number(order.entry_count || 0) > 0).length;
  const missingEligible = orders.filter((order) => Number(order.total_cents || 0) >= rule.LOT_ORDER_MINIMUM_CENTS && Number(order.entry_count || 0) === 0).length;
  const statusRows = db.prepare(`
    SELECT o.financial_status AS status, COUNT(*) AS count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${filter.whereSql}
    GROUP BY o.financial_status
    ORDER BY count DESC
  `).all(...filter.params);

  res.send(page("Orders | Meat For Free", "orders", `
    ${topbar("Orders", "Orderkwaliteit en lottoekenning.", `Controleer of orders volgens ${ruleLabel(rule)} correct loten krijgen.`, `<form class="inline-form" method="post" action="/admin/reconcile"><button type="submit">Orders syncen</button></form>`)}
    <section class="filters">
      <form method="get" action="/admin/orders" class="filter-grid">
        <label class="wide">Zoek order of klant<input name="orderQ" value="${escapeHtml(filter.filter.orderQ)}" placeholder="#1001 of email"></label>
        <label>Status<select name="orderStatus">${option("", filter.filter.orderStatus, "Alle statussen")}${orderStatuses.map((row) => option(row.status, filter.filter.orderStatus, statusLabel(row.status))).join("")}</select></label>
        <label>Kwalificeert<select name="eligible">${option("", filter.filter.eligible, "Alle orders")}${option("yes", filter.filter.eligible, "Boven lotgrens")}${option("no", filter.filter.eligible, "Onder lotgrens")}</select></label>
        <label>Lottoekenning<select name="lotState">${option("", filter.filter.lotState, "Met en zonder lot")}${option("with", filter.filter.lotState, "Met loten")}${option("without", filter.filter.lotState, "Zonder loten")}</select></label>
        <label>Min. order €<input name="minTotal" inputmode="decimal" value="${escapeHtml(filter.filter.minTotal)}" placeholder="70"></label>
        <label>Max. order €<input name="maxTotal" inputmode="decimal" value="${escapeHtml(filter.filter.maxTotal)}" placeholder="250"></label>
        <label>Vanaf<input type="date" name="from" value="${escapeHtml(filter.filter.from)}"></label>
        <label>Tot<input type="date" name="to" value="${escapeHtml(filter.filter.to)}"></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/orders">Reset</a></div>
      </form>
    </section>
    ${kpiGrid([{ label: "Orders", value: totals.count || 0, help: "Binnen actieve filters.", icon: "ShoppingCart" }, { label: "Kwalificerend", value: eligibleCount, help: `Volgens ${ruleLabel(rule)}.`, icon: "Target" }, { label: "Met loten", value: withEntries, help: "Orders waar toekenning al gebeurd is.", icon: "Tickets" }, { label: "Missend", value: missingEligible, help: "Kwalificerende orders zonder lot.", icon: "TriangleAlert" }])}
    <section class="grid grid-2">
      ${breakdownPanel("Orders per status", statusRows, Math.max(totals.count || 0, 1))}
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Toekenningscontrole</h2></div>
        <div class="stack">
          <div class="ops-item"><span class="ops-icon">${icon("Target")}</span><span><strong>${eligibleCount} order(s) kwalificeren</strong><br><span class="muted">Dit zijn de orders die minstens 1 lot horen te krijgen.</span></span><span class="status">Regel</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("Tickets")}</span><span><strong>${withEntries} order(s) hebben al loten</strong><br><span class="muted">Handig voor snelle coverage check binnen je selectie.</span></span><span class="status">Dekking</span></div>
          <div class="ops-item"><span class="ops-icon">${icon("PackageSearch")}</span><span><strong>${missingEligible} order(s) missen nog loten</strong><br><span class="muted">Bij afwijking direct synchroniseren of orderdata nalopen.</span></span><span class="status">${missingEligible ? "Actie" : "Goed"}</span></div>
        </div>
      </div>
    </section>
    <div class="panel">${ordersTable(orders)}</div>
  `));
});

adminRouter.get("/deelnemers", (req, res) => {
  const filter = customerFilter(req);
  const customers = db.prepare(`
    SELECT c.*, COUNT(e.id) AS entry_count,
      SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN e.status = 'WINNER' THEN 1 ELSE 0 END) AS winner_count
    FROM customers c
    LEFT JOIN lottery_entries e ON e.customer_id = c.id
    ${filter.whereSql}
    GROUP BY c.id
    ${filter.havingSql}
    ORDER BY entry_count DESC, c.updated_at DESC
    LIMIT 120
  `).all(...filter.params);
  const totalEntries = customers.reduce((sum, row) => sum + Number(row.entry_count || 0), 0);
  const avgEntries = customers.length ? (totalEntries / customers.length).toFixed(1) : "0.0";
  const winners = customers.filter((row) => Number(row.winner_count || 0) > 0).length;
  const linked = customers.filter((row) => row.shopify_customer_id).length;

  res.send(page("Deelnemers | Meat For Free", "deelnemers", `
    ${topbar("Deelnemers", "Klanten en deelnamewaarde.", "Zie wie de meeste loten heeft, wie actief is en waar winnaars zitten.", "")}
    <section class="filters">
      <form method="get" action="/admin/deelnemers" class="filter-grid">
        <label class="wide">Zoek deelnemer<input name="q" value="${escapeHtml(filter.filter.q)}" placeholder="Email, naam of Shopify klant-ID"></label>
        <label>Min. loten<input name="minEntries" inputmode="numeric" value="${escapeHtml(filter.filter.minEntries)}" placeholder="3"></label>
        <label>Winnaars<select name="winnersOnly">${option("", filter.filter.winnersOnly, "Iedereen")}${option("true", filter.filter.winnersOnly, "Alleen winnaars")}</select></label>
        <label>Shopify koppeling<select name="linkedOnly">${option("", filter.filter.linkedOnly, "Met en zonder koppeling")}${option("true", filter.filter.linkedOnly, "Alleen gekoppeld")}</select></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/deelnemers">Reset</a></div>
      </form>
    </section>
    ${kpiGrid([{ label: "Deelnemers", value: customers.length, help: "Top 120 zichtbaar.", icon: "Users" }, { label: "Actieve loten", value: customers.reduce((sum, row) => sum + Number(row.active_count || 0), 0), help: "Geldige deelname.", icon: "Tickets" }, { label: "Gem. loten", value: avgEntries, help: "Gemiddeld per deelnemer in deze selectie.", icon: "BarChart3" }, { label: "Shopify koppeling", value: linked, help: `${winners} klant(en) wonnen minstens 1 keer.`, icon: "Link2" }])}
    <div class="panel">
      <table>
        <thead><tr><th>Klant</th><th>Email</th><th>Totaal loten</th><th>Actief</th><th>Winnaars</th><th>Laatste update</th></tr></thead>
        <tbody>${customers.length ? customers.map((customer) => `<tr>
          <td><strong>${escapeHtml([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Klant")}</strong><span class="muted">${escapeHtml(customer.shopify_customer_id || "Geen Shopify ID")}</span></td>
          <td>${escapeHtml(customer.email || "-")}</td>
          <td>${customer.entry_count || 0}</td>
          <td>${customer.active_count || 0}</td>
          <td>${customer.winner_count || 0}</td>
          <td>${escapeHtml(customer.updated_at)}</td>
        </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Nog geen deelnemers.</div></td></tr>`}</tbody>
      </table>
    </div>
  `));
});

adminRouter.get("/compliance", (_req, res) => {
  const metrics = getMetrics();
  const suspiciousIps = suspiciousIpRows(10);
  const rule = getLotteryRule();
  const { totals, orderTotals } = metrics;
  const alerts = complianceAlerts(metrics);
  const logs = auditRows(12);
  const highRiskIps = suspiciousIps.filter((row) => row.risk_label === "Hoog").length;
  const claimStats = db.prepare(`
    SELECT COUNT(*) AS total_claims, COUNT(DISTINCT ip_hash) AS unique_ips, COUNT(DISTINCT email) AS unique_emails
    FROM free_entry_claims
  `).get();
  const checks = [
    ["Gratis deelname aandeel", percent(totals.free_entries || 0, totals.total_entries || 0), totals.free_entries || 0, totals.total_entries || 0],
    ["Ongeldige loten", percent(totals.void_entries || 0, totals.total_entries || 0), totals.void_entries || 0, totals.total_entries || 0],
    ["Geschikte orders zonder lot", String(metrics.eligibleWithoutEntry), metrics.eligibleWithoutEntry, Math.max(metrics.eligibleWithoutEntry, orderTotals.eligible_orders || 0)],
    ["Live acties zonder loten", String(metrics.liveDrawsWithoutEntries), metrics.liveDrawsWithoutEntries, Math.max(metrics.liveDrawsWithoutEntries, metrics.liveDraws || 0)]
  ];

  res.send(page("Compliance | Meat For Free", "compliance", `
    ${topbar("Compliance", "Alleen actiepunten en bewijs.", "IP's worden gehasht opgeslagen: genoeg om misbruik te blokkeren, zonder rauwe IP's in het dashboard.", "")}
    ${kpiGrid([{ label: "Gratis claims", value: claimStats.total_claims || 0, help: `${claimStats.unique_ips || 0} unieke IP-hashes.`, icon: "ShieldCheck" }, { label: "Hoge risico's", value: highRiskIps, help: "IP-hashes met meerdere risicosignalen.", icon: "ShieldAlert" }, { label: "Geschikt zonder lot", value: metrics.eligibleWithoutEntry, help: "Moet richting 0 blijven.", icon: "PackageSearch" }, { label: "Orderdekking", value: percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0), help: ruleLabel(rule), icon: "Target" }])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Actiepunten</h2></div>
        <div class="stack">${alerts.map(([iconName, title, body, href]) => `<a class="ops-item" href="${href}" style="text-decoration:none"><span class="ops-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${iconName === "ShieldCheck" ? "Goed" : "Actie"}</span></a>`).join("")}</div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Auditratio's</h2></div>
        <div class="stack">${checks.map(([label, value, part, total]) => `<div class="metric-row"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div><div class="bar"><span style="width:${ratio(part, total)}%"></span></div></div>`).join("")}</div>
      </div>
    </section>
    <div class="section-head"><h2>Verdachte IP-hashes</h2><span class="muted">Alleen hashes, geen rauwe IP-adressen.</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>IP-hash</th><th>Risico</th><th>Claims</th><th>Winacties</th><th>Emails</th><th>Laatst gezien</th></tr></thead>
        <tbody>${suspiciousIps.length ? suspiciousIps.map((row) => `<tr>
          <td><strong>${escapeHtml(String(row.ip_hash).slice(0, 12))}...</strong><span class="muted">Afgekapt voor leesbaarheid</span></td>
          <td>${statusBadge(row.risk_label)}</td>
          <td>${row.claim_count}</td>
          <td>${row.draw_count}</td>
          <td>${row.email_count}</td>
          <td>${escapeHtml(row.last_seen)}</td>
        </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen IP-hashes met opvallend patroon.</div></td></tr>`}</tbody>
      </table>
    </div>
    <div class="section-head"><h2>Auditlog</h2><a class="button button--ghost" href="/admin/regels">Lotregels beheren</a></div>
    <div class="panel">
      <table>
        <thead><tr><th>Tijd</th><th>Actie</th><th>Doel</th><th>Bericht</th></tr></thead>
        <tbody>${logs.length ? logs.map((log) => `<tr>
          <td>${escapeHtml(log.created_at)}</td>
          <td><strong>${escapeHtml(log.action)}</strong><span class="muted">${escapeHtml(log.actor)}</span></td>
          <td>${escapeHtml(log.target_type)}<br><span class="muted">${escapeHtml(log.target_id || "-")}</span></td>
          <td>${escapeHtml(log.message || "-")}</td>
        </tr>`).join("") : `<tr><td colspan="4"><div class="empty">Nog geen beheeracties gelogd.</div></td></tr>`}</tbody>
      </table>
    </div>
  `));
});

adminRouter.get("/regels", (_req, res) => {
  const rule = getLotteryRule();
  res.send(page("Regels | Meat For Free", "regels", `
    ${topbar("Regels", "Lottoekenning beheren.", "Wijzig alleen wat operationeel nodig is: ordergrens, berekeningsmodus en gratis deelname.", "")}
    ${kpiGrid([
      { label: "Actieve regel", value: ruleLabel(rule), help: "Wordt gebruikt bij nieuwe orders.", icon: "SlidersHorizontal" },
      { label: "Modus", value: rule.LOT_RULE_MODE === "PER_AMOUNT" ? "Per bedrag" : "Ordergrens", help: "Bepaalt hoeveel loten een order krijgt.", icon: "Waypoints" },
      { label: "Gratis deelname", value: rule.FREE_ENTRY_ENABLED ? "Open" : "Gesloten", help: "Voor deelname zonder aankoop.", icon: "Gift" },
      { label: "Privacy", value: "IP-hash", help: "Geen rauwe IP's in dashboard.", icon: "LockKeyhole" }
    ])}
    <section class="panel panel-pad">
      <div class="panel-title"><h2>Instellingen</h2></div>
      <form method="post" action="/admin/regels" class="form-grid">
        <label>Modus
          <select name="mode">
            ${option("ORDER_MINIMUM", rule.LOT_RULE_MODE, "1 lot vanaf ordergrens")}
            ${option("PER_AMOUNT", rule.LOT_RULE_MODE, "1 lot per bedrag")}
          </select>
        </label>
        <label>Ordergrens €
          <input name="minimumEuro" inputmode="decimal" value="${escapeHtml((rule.LOT_ORDER_MINIMUM_CENTS / 100).toFixed(2).replace(".", ","))}">
        </label>
        <label>Bedrag per lot €
          <input name="perEuro" inputmode="decimal" value="${escapeHtml((rule.LOT_PER_CENTS / 100).toFixed(2).replace(".", ","))}">
        </label>
        <label>Gratis deelname
          <select name="freeEntryEnabled">
            ${option("true", String(rule.FREE_ENTRY_ENABLED), "Open")}
            ${option("false", String(rule.FREE_ENTRY_ENABLED), "Gesloten")}
          </select>
        </label>
        <div class="actions" style="justify-content:flex-start"><button type="submit">Regels opslaan</button></div>
      </form>
    </section>
  `));
});

adminRouter.post("/regels", urlencoded, (req, res) => {
  const rule = updateLotteryRule({
    mode: req.body.mode,
    minimumCents: euroInputToCents(req.body.minimumEuro),
    perCents: euroInputToCents(req.body.perEuro),
    freeEntryEnabled: req.body.freeEntryEnabled === "true"
  });
  writeAuditLog({
    actor: actor(req),
    action: "LOTREGELS_AANGEPAST",
    targetType: "app_settings",
    message: `Nieuwe regel: ${ruleLabel(rule)}`,
    metadata: rule
  });
  res.redirect("/admin/regels");
});

adminRouter.get("/sync", (_req, res) => {
  const metrics = getMetrics();
  res.send(page("Synchronisatie | Meat For Free", "sync", `
    ${topbar("Synchronisatie", "Systeemacties voor datakwaliteit.", "Gebruik deze pagina als Shopify data, klantdashboards of loten niet gelijk lopen.", "")}
    ${kpiGrid([{ label: "Geschikt zonder lot", value: metrics.eligibleWithoutEntry, help: "Na ordersynchronisatie moet dit dalen.", icon: "PackageSearch" }, { label: "Live loten", value: metrics.activeLiveEntries, help: "Beschikbaar in live acties.", icon: "Tickets" }, { label: "Laatste 7 dagen", value: metrics.recentEntries, help: "Nieuwe lotactiviteit.", icon: "Activity" }, { label: "Vandaag orders", value: metrics.todayOrders, help: "Vandaag verwerkt.", icon: "ShoppingCart" }])}
    <section class="grid grid-2">
      <div class="panel panel-pad"><div class="panel-title"><h2>Orders met loten synchroniseren</h2></div><p class="muted">Reconcilieert orders die recht hebben op loten maar nog geen lot kregen.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/reconcile"><button type="submit">Orders synchroniseren</button></form></div></div>
      <div class="panel panel-pad"><div class="panel-title"><h2>Klantdashboards synchroniseren</h2></div><p class="muted">Schrijft de huidige lotdata terug naar Shopify klantmetafields.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/sync-dashboards"><button class="button--gold" type="submit">Klantdashboards synchroniseren</button></form></div></div>
    </section>
  `));
});

adminRouter.get("/api", (_req, res) => {
  res.send(page("API | Meat For Free", "api", `
    ${topbar("API", "Technische koppelingen.", "Snelle links voor embed, live winacties en klantdata.", "")}
    <section class="grid grid-3">
      <div class="panel panel-pad"><h2>Live winacties</h2><p class="helper">JSON voor actieve trekkingen.</p><p style="margin-top:12px"><a class="button button--ghost" href="/api/draws/live">/api/draws/live</a></p></div>
      <div class="panel panel-pad"><h2>Site samenvatting</h2><p class="helper">Gebruikt door frontend/embed voor actie-info.</p><p style="margin-top:12px"><a class="button button--ghost" href="/api/site/summary">/api/site/summary</a></p></div>
      <div class="panel panel-pad"><h2>Embed script</h2><p class="helper">Shopify embed startpunt.</p><p style="margin-top:12px"><a class="button button--ghost" href="/embed/dvl-lottery.js">/embed/dvl-lottery.js</a></p></div>
    </section>
  `));
});

adminRouter.get("/embed", (_req, res) => {
  const widgets = [
    ["live", "Homepage live winactie", "Hero/section met hoofdprijs, lotregel en countdown."],
    ["cart", "Cart gratis-lot progress", "Toont hoeveel er nog nodig is tot een gratis lot. Gebruik liefst als directe Shopify script embed."],
    ["winners", "Laatste winnaars", "Compact bewijsblok met recente winnaars."],
    ["customer", "Mijn MFF teaser", "Klantdashboard entrypoint met live status."],
    ["pdp", "PDP lot-progress", "Compact productblok: laat zien of dit product al richting een gratis lot telt."],
    ["free-entry", "Gratis deelname", "Formulier voor 1 keer gratis meedoen."]
  ];
  const widgetSnippet = (type) => {
    if (type === "pdp") return '<div data-dvl-lottery="pdp" data-product-price-cents="{{ product.price }}"></div>';
    if (type === "customer") return '<div data-dvl-lottery="customer" data-shopify-customer-id="{{ customer.id }}" data-customer-token="{{ customer.metafields.mff.dashboard_token }}"></div>';
    return `<div data-dvl-lottery="${type}"></div>`;
  };
  const scriptUrl = "https://dvl-lottery-app.onrender.com/embed/dvl-lottery.js";
  res.send(page("Embed | Meat For Free", "embed", `
    ${topbar("Embed control", "Plaats MFF op de site.", "Een widget per plek: live winactie, cart progress, winnaars, dashboard of gratis deelname.", `<a class="button button--gold" href="/embed/demo">Open demo</a>`)}
    <section class="panel panel-pad">
      <div class="panel-title"><div><h2>Script</h2><p class="helper">Plaats dit script een keer op de pagina waar je MFF widgets gebruikt.</p></div></div>
      <input readonly value="${scriptUrl}" onclick="this.select()">
      <pre style="white-space:pre-wrap;margin:12px 0 0;padding:14px;border:1px solid var(--line);border-radius:10px;background:#fff;font-size:12px;line-height:1.45;overflow:auto">&lt;script async src="${scriptUrl}"&gt;&lt;/script&gt;</pre>
    </section>
    <section class="grid grid-2" style="margin-top:18px">
      ${widgets.map(([type, title, help]) => `
        <div class="panel panel-pad">
          <div class="panel-title"><div><h2>${escapeHtml(title)}</h2><p class="helper">${escapeHtml(help)}</p></div><span class="status status--active">${escapeHtml(type)}</span></div>
          <label>Direct script div</label>
          <input readonly value='${escapeHtml(widgetSnippet(type))}' onclick="this.select()">
          <label style="margin-top:12px">Iframe preview</label>
          <input readonly value='https://dvl-lottery-app.onrender.com/embed/frame?widget=${escapeHtml(type)}' onclick="this.select()">
          <p style="margin-top:12px"><a class="button button--ghost" href="/embed/frame?widget=${escapeHtml(type)}">Open preview</a></p>
        </div>
      `).join("")}
    </section>
  `));
});

adminRouter.get("/draws/:id/export.csv", (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send("Winactie niet gevonden");
  const rows = db.prepare(`
    SELECT e.entry_number, e.source, e.status, e.reason, e.created_at, c.email, c.first_name, c.last_name, o.order_name, o.total_cents
    FROM lottery_entries e
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.draw_id = ?
    ORDER BY e.created_at ASC
  `).all(draw.id);
  const header = ["lotnummer", "status", "bron", "email", "voornaam", "achternaam", "order", "orderwaarde", "reden", "aangemaakt"];
  const body = rows.map((row) => [
    row.entry_number,
    statusLabel(row.status),
    statusLabel(row.source),
    row.email,
    row.first_name,
    row.last_name,
    row.order_name,
    formatEuro(row.total_cents || 0),
    row.reason,
    row.created_at
  ].map(csv).join(","));
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${draw.slug || draw.id}-loten.csv"`);
  return res.send([header.map(csv).join(","), ...body].join("\n"));
});

adminRouter.post("/draws/:id/draw", async (req, res) => {
  try {
    const winner = await drawWinner(req.params.id);
    writeAuditLog({
      actor: actor(req),
      action: "WINNAAR_GETROKKEN",
      targetType: "lottery_draw",
      targetId: req.params.id,
      message: `Winnaar ${winner.entry_number}`,
      metadata: { winnerEntryId: winner.id }
    });
    res.redirect(`/admin/winacties/${req.params.id}`);
  } catch (error) {
    res.status(400).send(page("Trekking fout", "winacties", topbar("Actie gestopt", "Kan geen winnaar trekken.", error.message, `<a class="button button--gold" href="/admin/winacties/${escapeHtml(req.params.id)}">Terug</a>`)));
  }
});

adminRouter.post("/loten/:id/void", urlencoded, async (req, res) => {
  try {
    const result = await setEntryStatus(req.params.id, "VOID", textParam(req.body.reason) || "Handmatig ongeldig gemaakt door admin.");
    if (result.changed) {
      writeAuditLog({
        actor: actor(req),
        action: "LOT_ONGELDIG_GEMAAKT",
        targetType: "lottery_entry",
        targetId: req.params.id,
        message: result.entry.entry_number,
        metadata: { entryNumber: result.entry.entry_number, previousStatus: result.entry.previousStatus, newStatus: "VOID" }
      });
    }
    res.redirect(req.get("referer") || "/admin/loten");
  } catch (error) {
    res.status(400).send(page("Lot fout", "loten", topbar("Actie gestopt", "Kan lot niet ongeldig maken.", error.message, `<a class="button button--gold" href="/admin/loten">Terug</a>`)));
  }
});

adminRouter.post("/loten/:id/activate", urlencoded, async (req, res) => {
  try {
    const result = await setEntryStatus(req.params.id, "ACTIVE", textParam(req.body.reason) || "Handmatig hersteld door admin.");
    if (result.changed) {
      writeAuditLog({
        actor: actor(req),
        action: "LOT_HERSTELD",
        targetType: "lottery_entry",
        targetId: req.params.id,
        message: result.entry.entry_number,
        metadata: { entryNumber: result.entry.entry_number, newStatus: "ACTIVE" }
      });
    }
    res.redirect(req.get("referer") || "/admin/loten");
  } catch (error) {
    res.status(400).send(page("Lot fout", "loten", topbar("Actie gestopt", "Kan lot niet herstellen.", error.message, `<a class="button button--gold" href="/admin/loten">Terug</a>`)));
  }
});

adminRouter.post("/reconcile", async (_req, res) => {
  const result = await reconcileActiveOrderEntries();
  writeAuditLog({
    actor: "admin",
    action: "ORDERS_GESYNCHRONISEERD",
    targetType: "orders",
    message: `${result.checked || 0} actieve orders gecontroleerd`,
    metadata: result
  });
  res.redirect("/admin/sync");
});

adminRouter.post("/sync-dashboards", async (_req, res) => {
  const result = await syncAllCustomerDashboardMetafields();
  writeAuditLog({
    actor: "admin",
    action: "KLANTDASHBOARDS_GESYNCHRONISEERD",
    targetType: "customer_metafields",
    message: `${result.count || 0} klanten verwerkt`,
    metadata: result
  });
  res.redirect("/admin/sync");
});

function drawForm(draw, action, submitLabel) {
  return `<form method="post" action="${action}">
    <div class="form-grid">
      <label>Titel<input name="title" required value="${escapeHtml(draw?.title || "")}" placeholder="Bijv. Juli BBQ trekking"></label>
      <label>Slug<input name="slug" value="${escapeHtml(draw?.slug || "")}" placeholder="juli-bbq-trekking"><span class="helper">Voor URL/API herkenning. Laat leeg bij nieuw voor automatische slug.</span></label>
      <label>Prijsnaam<input name="prizeName" required value="${escapeHtml(draw?.prize_name || "")}" placeholder="Bijv. 1 jaar gratis vlees"></label>
      <label>Prijswaarde<input name="prizeValue" value="${escapeHtml(draw?.prize_value || "")}" placeholder="Bijv. Hoofdprijs t.w.v. €1.200"></label>
      <label>Startdatum<input type="date" name="startsAt" value="${escapeHtml(dateInput(draw?.starts_at))}"></label>
      <label>Einddatum<input type="date" name="endsAt" value="${escapeHtml(dateInput(draw?.ends_at))}"></label>
      <label>Trekdatum<input type="date" name="drawAt" value="${escapeHtml(dateInput(draw?.draw_at))}"></label>
      <label>Status<select name="status">${drawStatuses.map((status) => option(status, draw?.status || "DRAFT", statusLabel(status))).join("")}</select></label>
      <label class="wide">Beschrijving<textarea name="description" placeholder="Korte uitleg die richting klant en admin bruikbaar blijft.">${escapeHtml(draw?.description || "")}</textarea></label>
    </div>
    <div class="actions" style="justify-content:flex-start; margin-top:18px">
      <button type="submit">${escapeHtml(submitLabel)}</button>
      <a class="button button--ghost" href="/admin/winacties">Annuleren</a>
    </div>
  </form>`;
}

function drawFilter(req) {
  const filter = {
    q: textParam(req.query.q),
    status: textParam(req.query.status),
    winnerState: textParam(req.query.winnerState),
    from: isoDateParam(req.query.from),
    to: isoDateParam(req.query.to)
  };
  const where = [];
  const params = [];
  if (filter.status) {
    where.push("d.status = ?");
    params.push(filter.status);
  }
  if (filter.q) {
    where.push("(d.title LIKE ? OR d.slug LIKE ? OR d.prize_name LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.winnerState === "yes") {
    where.push("d.winner_entry_id IS NOT NULL");
  }
  if (filter.winnerState === "no") {
    where.push("d.winner_entry_id IS NULL");
  }
  if (filter.from) {
    where.push("date(COALESCE(d.starts_at, d.created_at)) >= date(?)");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("date(COALESCE(d.ends_at, d.created_at)) <= date(?)");
    params.push(filter.to);
  }
  return { filter, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

function drawTable(draws) {
  return `<table>
    <thead><tr><th>Titel</th><th>Status</th><th>Prijs</th><th>Loten</th><th>Timing</th><th>Winnaar</th><th>Acties</th></tr></thead>
    <tbody>${draws.length ? draws.map((draw) => `<tr>
      <td><strong>${escapeHtml(draw.title)}</strong><span class="muted">${escapeHtml(draw.slug)}</span></td>
      <td>${statusBadge(draw.status)}</td>
      <td><strong>${escapeHtml(draw.prize_name)}</strong><span class="muted">${escapeHtml(draw.prize_value || "-")}</span></td>
      <td>${draw.entry_count || 0}</td>
      <td><span class="muted">Start</span> ${escapeHtml(dateInput(draw.starts_at) || "-")}<br><span class="muted">Trekking</span> ${escapeHtml(dateInput(draw.draw_at) || "-")}</td>
      <td>${escapeHtml(draw.winner_email || draw.winner_entry_number || "-")}</td>
      <td><div class="actions" style="justify-content:flex-start">
        <a class="button button--ghost" href="/admin/winacties/${escapeHtml(draw.id)}">Beheer</a>
        <a class="button button--ghost" href="/admin/draws/${escapeHtml(draw.id)}/export.csv">CSV</a>
        ${draw.status === "LIVE" ? `<form class="inline-form" method="post" action="/admin/draws/${escapeHtml(draw.id)}/draw"><button type="submit">Trek</button></form>` : ""}
      </div></td>
    </tr>`).join("") : `<tr><td colspan="7"><div class="empty">Nog geen winacties.</div></td></tr>`}</tbody>
  </table>`;
}

function entryFilters(filter, action, drawOptions = []) {
  return `<section class="filters">
    <form method="get" action="${action}" class="filter-grid">
      <label class="wide">Zoek lot, klant, order of winactie<input name="q" value="${escapeHtml(filter.q)}" placeholder="Email, lotnummer, ordernummer"></label>
      <label>Winactie<select name="drawId">${option("", filter.drawId, "Alle winacties")}${drawOptions.map((draw) => option(draw.id, filter.drawId, draw.title)).join("")}</select></label>
      <label>Lotstatus<select name="entryStatus">${option("", filter.entryStatus, "Alle lotstatussen")}${entryStatuses.map((status) => option(status, filter.entryStatus, statusLabel(status))).join("")}</select></label>
      <label>Bron<select name="source">${option("", filter.source, "Alle bronnen")}${entrySources.map((source) => option(source, filter.source, statusLabel(source))).join("")}</select></label>
      <label>Winactie status<select name="drawStatus">${option("", filter.drawStatus, "Alle winacties")}${drawStatuses.map((status) => option(status, filter.drawStatus, statusLabel(status))).join("")}</select></label>
      <label>Orderkoppeling<select name="hasOrder">${option("", filter.hasOrder, "Met en zonder order")}${option("yes", filter.hasOrder, "Met order")}${option("no", filter.hasOrder, "Zonder order")}</select></label>
      <label>Vanaf<input type="date" name="from" value="${escapeHtml(filter.from)}"></label>
      <label>Tot<input type="date" name="to" value="${escapeHtml(filter.to)}"></label>
      <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="${action}">Reset</a></div>
    </form>
  </section>`;
}

function entriesTable(entries, options = {}) {
  const controls = Boolean(options.controls);
  return `<table>
    <thead><tr><th>Lot</th><th>Bron</th><th>Klant</th><th>Winactie</th><th>Status</th><th>Datum</th>${controls ? "<th>Controle</th>" : ""}</tr></thead>
    <tbody>${entries.length ? entries.map((entry) => `<tr>
      <td><strong>${escapeHtml(entry.entry_number)}</strong><span class="muted">${escapeHtml(entry.order_name || "-")}</span></td>
      <td>${escapeHtml(statusLabel(entry.source))}</td>
      <td>${escapeHtml(entry.email || "-")}</td>
      <td>${escapeHtml(entry.draw_title || "-")}</td>
      <td>${statusBadge(entry.status)}</td>
      <td>${escapeHtml(entry.created_at)}</td>
      ${controls ? `<td>${entryControl(entry)}</td>` : ""}
    </tr>`).join("") : `<tr><td colspan="${controls ? 7 : 6}"><div class="empty">Geen loten gevonden.</div></td></tr>`}</tbody>
  </table>`;
}

function entryControl(entry) {
  if (!entry.id) return `<span class="muted">-</span>`;
  if (entry.status === "WINNER") return `<span class="muted">Winnaar vastgelegd</span>`;
  if (entry.status === "VOID") {
    return `<form class="inline-form" method="post" action="/admin/loten/${escapeHtml(entry.id)}/activate"><button class="button--ghost" type="submit">${icon("RotateCcw")}Herstel</button></form>`;
  }
  return `<form class="inline-form" method="post" action="/admin/loten/${escapeHtml(entry.id)}/void"><button class="button--ghost" type="submit">${icon("Ban")}Ongeldig</button></form>`;
}

function ordersTable(orders) {
  return `<table>
    <thead><tr><th>Order</th><th>Klant</th><th>Waarde</th><th>Loten</th><th>Status</th><th>Datum</th></tr></thead>
    <tbody>${orders.length ? orders.map((order) => `<tr>
      <td><strong>${escapeHtml(order.order_name || order.shopify_order_id)}</strong><span class="muted">${escapeHtml(order.shopify_order_id)}</span></td>
      <td>${escapeHtml(order.customer_email || order.email || "-")}</td>
      <td>${formatEuro(order.total_cents)}</td>
      <td>${order.entry_count || 0}</td>
      <td>${statusBadge(order.financial_status || "-")}</td>
      <td>${escapeHtml(order.created_at)}</td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen orders gevonden.</div></td></tr>`}</tbody>
  </table>`;
}
