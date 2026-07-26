import express from "express";
import { db, id, nowIso } from "../db.js";
import { createDraw, drawWinner, getOrCreateCustomer, syncStoredOrderLineItems } from "../services/lottery.js";
import { syncAllCustomerDashboardMetafields, syncCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { getLotteryRule, getSiteStructure, updateLotteryRule, updateSiteStructure, getWidgetSettings, updateWidgetSettings, widgetDefinitions, widgetVisualDefaults } from "../services/settings.js";
import { listSyncedProducts, productSyncStatus, syncShopifyProducts } from "../services/shopify-products.js";
import { recentSecurityEvents, securityEventSummary } from "../services/security-events.js";
import { analyticsActionItems, analyticsSummary } from "../services/analytics.js";
import { writeAuditLog } from "../services/audit.js";
import {
  adminPermissionDefinitions,
  changeOwnAdminPassword,
  confirmAdminTotpSetup,
  createAdminInvite,
  createAdminPasswordReset,
  createAdminUser,
  disableAdminTotp,
  getAdminTotpSetup,
  getAdminUser,
  hasAdminPermission,
  listAdminInvites,
  listAdminPasswordResets,
  listAdminSessions,
  listAdminUsers,
  revokeAdminInvite,
  revokeAdminSession,
  revokeAdminUserSessions,
  setAdminUserPassword,
  startAdminTotpSetup,
  updateOwnAdminProfile,
  updateAdminUser
} from "../services/admin-accounts.js";
import {
  createKpiMessage,
  createKpiThread,
  getKpiThread,
  kpiDiscussionSummary,
  kpiThreadDefinitions,
  listKpiMessages,
  listKpiThreads,
  updateKpiThread
} from "../services/admin-collaboration.js";
import { brandMarkSvg, brandPalette } from "../services/admin-brand.js";
import { icon } from "../services/admin-icons.js";
import { formatEuro, makeEntryNumber } from "../utils.js";

export const adminRouter = express.Router();
adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});

const urlencoded = express.urlencoded({ extended: false, limit: "64kb" });
const drawStatuses = ["DRAFT", "LIVE", "DRAWN", "ARCHIVED"];
const editableDrawStatuses = ["DRAFT", "LIVE", "ARCHIVED"];
const entryStatuses = ["ACTIVE", "WINNER", "VOID"];
const entrySources = ["ORDER_THRESHOLD", "FREE_ENTRY", "MANUAL", "SUBSCRIPTION"];

function actor(req) {
  return req.adminUser?.username || "admin";
}

function requirePermission(req, permission) {
  if (!hasAdminPermission(req.adminUser, permission)) throw new Error("Je hebt geen rechten voor deze beheeractie.");
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
    PRIVATE: "Privé",
    PUBLIC: "Publiek",
    NOT_CONTACTED: "Niet benaderd",
    CONTACTED: "Benaderd",
    REPLIED: "Reactie ontvangen",
    UNKNOWN: "Onbekend",
    REQUESTED: "Aangevraagd",
    APPROVED: "Goedgekeurd",
    DECLINED: "Geweigerd",
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
    ["groei", "/admin/groei", "LineChart", "Groei"],
    ["winacties", "/admin/winacties", "Gift", "Winacties"],
    ["winnaars", "/admin/winnaars", "Trophy", "Winnaars"],
    ["loten", "/admin/loten", "Tickets", "Loten"],
    ["orders", "/admin/orders", "ShoppingCart", "Orders"],
    ["producten", "/admin/producten", "Beef", "Producten"],
    ["deelnemers", "/admin/deelnemers", "Users", "Deelnemers"],
    ["teamhub", "/admin/teamhub", "MessagesSquare", "Teamhub"],
    ["accounts", "/admin/accounts", "UserCog", "Accounts"],
    ["compliance", "/admin/compliance", "ShieldCheck", "Compliance"],
    ["sync", "/admin/sync", "RefreshCw", "Synchronisatie"],
    ["regels", "/admin/regels", "SlidersHorizontal", "Regels"],
    ["site", "/admin/site-structuur", "LayoutTemplate", "Site structuur"],
    ["widgets", "/admin/widgets", "PanelTop", "Widgets"],
    ["nieuw", "/admin/new-draw", "Plus", "Nieuwe winactie"],
    ["embed", "/admin/embed", "ExternalLink", "Embed voorbeeld"]
  ];
  const mobileTabs = [
    ["overzicht", "/admin", "LayoutDashboard", "Overzicht"],
    ["analyse", "/admin/analyse", "ChartNoAxesCombined", "Analyse"],
    ["groei", "/admin/groei", "LineChart", "Groei"],
    ["site", "/admin/site-structuur", "LayoutTemplate", "Site"],
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
        .button[disabled], button[disabled] { opacity:.46; cursor:not-allowed; filter:saturate(.72); }
        .button[disabled]:hover, button[disabled]:hover { outline:none; }
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
        .card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; min-width:0; }
        .card-head strong { min-width:0; overflow-wrap:anywhere; }
        .card-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:10px; background:rgba(95,141,62,.12); color:var(--moss); }
        .stat { max-width:100%; margin-top:10px; color:var(--ink); font-size:clamp(28px,3.2vw,40px); line-height:1.05; font-weight:950; letter-spacing:0; overflow-wrap:anywhere; }
        .stat--text { font-size:clamp(20px,2vw,28px); line-height:1.1; }
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
        .status--public { background:#edf6ee; border-color:#c9e1cb; color:var(--success); }
        .status--private { background:#f4f1e8; border-color:#ddd6c8; color:#60584d; }
        .status--approved, .status--replied { background:#edf6ee; border-color:#c9e1cb; color:var(--success); }
        .status--unknown, .status--not-contacted { background:#f4f1e8; border-color:#ddd6c8; color:#60584d; }
        .status--requested, .status--contacted { background:#fff6df; border-color:#e5cb73; color:var(--warning); }
        .status--declined { background:#faeceb; border-color:#e7c1bf; color:var(--danger); }
        .status--pending { background:#fff6df; border-color:#e5cb73; color:#9a6700; }
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
        .product-cell { display:grid; grid-template-columns:58px minmax(0,1fr); gap:12px; align-items:center; }
        .product-thumb { width:58px; aspect-ratio:1; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:#f7f5ef; }
        .product-thumb img { width:100%; height:100%; display:block; object-fit:cover; }
        .product-thumb--empty { display:grid; place-items:center; color:var(--muted); }
        .sync-health { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .sync-health-item { padding:12px; border:1px solid var(--line-soft); border-radius:10px; background:#fff; }
        .sync-health-item strong { display:block; margin-top:4px; font-size:16px; font-weight:950; }
        .structure-grid { display:grid; gap:14px; }
        .structure-row { display:grid; grid-template-columns:88px minmax(160px,.9fr) minmax(160px,.9fr) minmax(220px,1.4fr); gap:12px; align-items:start; padding:14px; border:1px solid var(--line-soft); border-radius:10px; background:#fff; }
        .structure-row--compact { grid-template-columns:88px minmax(140px,.8fr) minmax(170px,1fr) minmax(150px,.85fr); }
        .structure-toggle { display:flex; align-items:center; gap:8px; min-height:40px; color:var(--ink); font-size:12px; font-weight:900; letter-spacing:0; text-transform:none; }
        .structure-toggle input { width:18px; min-height:18px; margin:0; accent-color:var(--moss); }
        .permission-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:8px; margin-top:8px; }
        .permission-check { min-height:58px; display:grid; grid-template-columns:18px minmax(0,1fr); gap:9px; align-items:start; padding:10px; border:1px solid var(--line-soft); border-radius:8px; background:#fff; color:var(--ink); font-size:12px; font-weight:850; letter-spacing:0; text-transform:none; }
        .permission-check input { width:16px; min-height:16px; margin:2px 0 0; accent-color:var(--moss); }
        .permission-check small { display:block; margin-top:3px; color:var(--muted); font-size:11px; font-weight:650; line-height:1.3; }
        .permission-summary { display:flex; flex-wrap:wrap; gap:5px; align-items:center; max-width:430px; }
        .avatar { width:42px; height:42px; display:inline-grid; place-items:center; flex:0 0 auto; overflow:hidden; border:1px solid var(--line); border-radius:50%; background:#eef5df; color:var(--forest); font-size:13px; font-weight:950; text-transform:uppercase; }
        .avatar img { width:100%; height:100%; display:block; object-fit:cover; }
        .avatar--lg { width:76px; height:76px; font-size:22px; }
        .avatar-row { display:flex; align-items:center; gap:12px; min-width:0; }
        .profile-card { display:grid; grid-template-columns:auto minmax(0,1fr); gap:16px; align-items:start; }
        .profile-upload { display:grid; gap:8px; margin-top:8px; }
        .profile-upload input[type="file"] { min-height:40px; margin:0; padding:8px; border-style:dashed; background:#fffdf8; font-size:11px; cursor:pointer; }
        .team-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
        .team-card { display:grid; gap:12px; padding:14px; border:1px solid var(--line); border-radius:10px; background:#fff; }
        .team-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .team-person { display:flex; align-items:center; gap:12px; min-width:0; }
        .team-person strong { display:block; font-size:14px; font-weight:950; overflow-wrap:anywhere; }
        .team-person small { display:block; margin-top:3px; color:var(--muted); font-size:11px; font-weight:750; }
        .presence { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font-size:11px; font-weight:850; }
        .presence::before { content:""; width:8px; height:8px; border-radius:50%; background:var(--success); }
        .presence--focus::before { background:var(--warning); }
        .presence--away::before { background:#8b8b84; }
        .hub-layout { display:grid; grid-template-columns:minmax(280px,.72fr) minmax(0,1.28fr); gap:16px; align-items:start; }
        .thread-list { display:grid; gap:10px; }
        .thread-card { display:grid; gap:9px; padding:13px; border:1px solid var(--line); border-radius:10px; background:#fff; text-decoration:none; }
        .thread-card:hover, .thread-card:focus-visible { outline:none; border-color:#cbdba2; background:#fbfdf7; }
        .thread-card--active { border-color:#a9c872; background:#f8fbf0; }
        .thread-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
        .thread-card strong { display:block; font-size:14px; font-weight:950; line-height:1.25; }
        .thread-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
        .discussion-panel { min-height:520px; display:grid; grid-template-rows:auto minmax(0,1fr) auto; }
        .message-list { display:grid; align-content:start; gap:12px; max-height:620px; overflow:auto; padding:16px; border-top:1px solid var(--line-soft); border-bottom:1px solid var(--line-soft); background:#fffdf8; }
        .message { display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; align-items:start; }
        .message-bubble { padding:11px 12px; border:1px solid var(--line); border-radius:10px; background:#fff; }
        .message-bubble header { position:static; min-height:auto; display:flex; padding:0; border:0; background:transparent; backdrop-filter:none; justify-content:space-between; gap:12px; }
        .message-bubble p { margin-top:7px; color:var(--ink); font-size:13px; font-weight:700; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
        .message-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; padding:14px; align-items:end; }
        .message-form textarea { min-height:70px; }
        .thread-create { display:grid; gap:12px; }
        .structure-meta { display:grid; gap:4px; padding:10px 0; }
        .structure-meta strong { font-size:13px; font-weight:950; }
        .code-line { width:100%; display:block; margin-top:8px; padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; line-height:1.4; overflow:auto; }
        .widget-editor { display:grid; gap:16px; }
        .widget-editor-card { border:1px solid var(--line); border-radius:14px; background:linear-gradient(180deg,#fffdf9,#faf7ef); overflow:hidden; }
        .widget-editor-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:12px; align-items:start; padding:18px; border-bottom:1px solid var(--line-soft); background:#fff; }
        .widget-editor-head h2 { font-size:22px; }
        .widget-editor-body { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,.72fr); gap:18px; padding:18px; align-items:start; }
        .widget-editor-body .form-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .widget-fieldset { display:grid; gap:12px; padding:14px; border:1px solid var(--line-soft); border-radius:12px; background:rgba(255,255,255,.62); }
        .widget-fieldset + .widget-fieldset { margin-top:12px; }
        .widget-fieldset-title { display:flex; align-items:center; justify-content:space-between; gap:10px; color:var(--ink); font-size:12px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
        .widget-field-help { display:block; margin-top:6px; color:var(--muted); font-size:11px; font-weight:650; letter-spacing:0; text-transform:none; }
        .widget-upload { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; align-items:end; margin-top:8px; }
        .widget-upload input[type="file"] { min-height:40px; margin:0; padding:8px; border-style:dashed; background:#fffdf8; font-size:11px; cursor:pointer; }
        .widget-upload-status { align-self:center; color:var(--muted); font-size:11px; font-weight:800; line-height:1.2; text-transform:none; letter-spacing:0; }
        .widget-upload-status--ok { color:var(--success); }
        .widget-upload-status--error { color:var(--danger); }
        .winner-publication-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; }
        .winner-publication-card { display:grid; gap:14px; border:1px solid var(--line); border-radius:12px; background:#fff; padding:14px; }
        .winner-publication-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:start; }
        .winner-publication-head strong { display:block; font-size:15px; font-weight:950; }
        .winner-publication-meta { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .winner-publication-note { grid-column:1 / -1; margin:0; padding:10px 12px; border:1px solid var(--line-soft); border-radius:10px; background:#fffaf0; color:var(--muted); font-size:12px; font-weight:750; line-height:1.35; }
        .winner-publication-card textarea { min-height:86px; }
        .winner-publication-actions { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; align-items:center; grid-column:1 / -1; }
        .winner-image-preview { width:72px; aspect-ratio:1; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:#f7f5ef; }
        .winner-image-preview img { width:100%; height:100%; object-fit:cover; display:block; }
        .winner-image-preview--empty { display:grid; place-items:center; color:var(--muted); }
        .winner-image-preview--empty svg { width:18px; height:18px; }
        .widget-color-row { display:grid; grid-template-columns:44px minmax(0,1fr); gap:8px; align-items:end; }
        input[type="color"] { min-height:40px; padding:3px; cursor:pointer; }
        input[type="range"] { padding:0; }
        .widget-preview { position:sticky; top:86px; display:grid; gap:10px; min-width:0; }
        .widget-preview-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .widget-preview-tools { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
        .widget-preview-toggle { min-height:30px; border:1px solid var(--line); border-radius:8px; background:#fffdf8; padding:0 10px; color:var(--ink); font:inherit; font-size:11px; font-weight:900; text-transform:uppercase; cursor:pointer; }
        .widget-preview-toggle[aria-pressed="true"] { background:var(--gold); box-shadow:2px 2px 0 #000; }
        .widget-preview-shell { display:grid; justify-items:center; padding:10px; border:1px solid var(--line); border-radius:14px; background:#efe8d9; box-shadow:0 12px 34px rgba(33,21,15,.08); transition:background 160ms ease; }
        .widget-preview[data-preview-size="mobile"] .widget-preview-shell { background:#d7d0c3; }
        .widget-preview-frame { width:100%; max-width:1180px; min-height:360px; border:1px solid var(--line); border-radius:10px; background:#fff7ea; }
        .widget-preview[data-preview-size="mobile"] .widget-preview-frame { max-width:390px; min-height:560px; }
        .widget-preview-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
        .widget-live-note { color:var(--muted); font-size:11px; font-weight:750; text-transform:none; letter-spacing:0; }
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
          .profile-card { grid-template-columns:1fr; }
          .team-card, .thread-card, .message-bubble { border-radius:16px; }
          .hub-layout { grid-template-columns:1fr; }
          .discussion-panel { min-height:auto; }
          .message-list { max-height:none; }
          .message-form { grid-template-columns:1fr; }
          .sync-health { grid-template-columns:1fr; }
          .structure-row, .structure-row--compact { grid-template-columns:1fr; border-radius:16px; }
          .structure-meta { padding:0; }
          .widget-editor-head { grid-template-columns:1fr; }
          .widget-editor-body { grid-template-columns:1fr; }
          .widget-editor-body .form-grid { grid-template-columns:1fr; }
          .widget-preview { position:static; }
          .winner-publication-list { grid-template-columns:1fr; }
          .winner-publication-card { border-radius:16px; }
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
          .hub-kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
          .hub-kpi-grid .card { min-height:118px; padding:14px 12px; border-radius:14px; }
          .hub-kpi-grid .card-head { gap:8px; align-items:start; }
          .hub-kpi-grid .card-icon { width:32px; height:32px; border-radius:9px; }
          .hub-kpi-grid .stat { font-size:28px; }
          .hub-kpi-grid .card p:last-child { font-size:11px; line-height:1.3; }
          .button, button { min-height:38px; border-radius:12px; }
          input, textarea, select { min-height:44px; border-radius:12px; }
          .metric-row > div:first-child { font-size:11px; }
          .status { padding:5px 8px; font-size:10px; }
        }
        @media (max-width:390px) {
          .grid:not(.hub-kpi-grid) { grid-template-columns:1fr; }
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
            ${menu.slice(0, 10).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Controle</p>
            ${menu.slice(10, 15).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Acties</p>
            ${menu.slice(15).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
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
  const primaryKeys = new Set(["overzicht", "analyse", "groei", "site"]);
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

function roleLabel(role) {
  const labels = {
    OWNER: "Eigenaar",
    ADMIN: "Admin",
    VIEWER: "Viewer"
  };
  return labels[role] || role || "-";
}

function permissionValues(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function permissionLabel(code) {
  return adminPermissionDefinitions.find(([permission]) => permission === code)?.[1] || code;
}

function permissionCheckboxes(name, selected = [], disabled = false) {
  const selectedSet = new Set(selected);
  return `<div class="permission-grid">
    ${adminPermissionDefinitions.map(([code, label, help]) => `<label class="permission-check">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(code)}"${selectedSet.has(code) ? " checked" : ""}${disabled ? " disabled" : ""}>
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span>
    </label>`).join("")}
  </div>`;
}

function permissionSummary(permissions = []) {
  if (!permissions.length) return `<span class="muted">Geen losse rechten.</span>`;
  return `<div class="permission-summary">${permissions.slice(0, 5).map((permission) => `<span class="status">${escapeHtml(permissionLabel(permission))}</span>`).join("")}${permissions.length > 5 ? `<span class="muted">+${permissions.length - 5} meer</span>` : ""}</div>`;
}

function initials(user) {
  const source = textParam(user?.name) || textParam(user?.username) || "MFF";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "MF";
}

function avatar(user, size = "") {
  const className = `avatar${size === "lg" ? " avatar--lg" : ""}`;
  const url = textParam(user?.avatarUrl || user?.avatar_url);
  if (url) return `<span class="${className}" aria-hidden="true"><img src="${escapeHtml(url)}" alt=""></span>`;
  return `<span class="${className}" aria-hidden="true">${escapeHtml(initials(user))}</span>`;
}

function availabilityLabel(status) {
  const labels = {
    ONLINE: "Beschikbaar",
    FOCUS: "Focus",
    AWAY: "Afwezig"
  };
  return labels[status] || "Beschikbaar";
}

function availabilityClass(status) {
  if (status === "FOCUS") return "presence--focus";
  if (status === "AWAY") return "presence--away";
  return "";
}

function kpiLabel(key) {
  return kpiThreadDefinitions.find(([code]) => code === key)?.[1] || "Overzicht";
}

function kpiOptions(current = "") {
  return kpiThreadDefinitions.map(([code, label]) => option(code, current, label)).join("");
}

function priorityLabel(priority) {
  const labels = { LOW: "Laag", NORMAL: "Normaal", HIGH: "Hoog", URGENT: "Urgent" };
  return labels[priority] || "Normaal";
}

function threadStatusLabel(status) {
  const labels = { OPEN: "Open", WATCHING: "Monitor", RESOLVED: "Afgerond" };
  return labels[status] || "Open";
}

function priorityStatusClass(priority) {
  if (priority === "URGENT" || priority === "HIGH") return "actie";
  if (priority === "LOW") return "laag";
  return "controle";
}

function threadStatusClass(status) {
  if (status === "RESOLVED") return "goed";
  if (status === "WATCHING") return "monitor";
  return "active";
}

function formatShortDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function currentUserPanel(user, reason = "") {
  const mustChange = reason === "password" || user?.forcePasswordChange;
  const setup = user?.id ? getAdminTotpSetup(user.id) : null;
  return `<section class="panel panel-pad">
    <div class="panel-title"><div><h2>Mijn profiel</h2><p class="helper">Zichtbaar in Teamhub, KPI-discussies en audit-context.</p></div>${mustChange ? '<span class="status status--actie">Wachtwoord verplicht</span>' : '<span class="status status--active">Actief</span>'}</div>
    <form method="post" action="/admin/account/profile" class="profile-card" data-profile-form>
      ${avatar(user, "lg")}
      <div class="stack">
        <div class="form-grid">
          <label>Naam<input name="name" value="${escapeHtml(user?.name || "")}" autocomplete="name"></label>
          <label>Functie<input name="title" value="${escapeHtml(user?.title || "")}" autocomplete="organization-title"></label>
          <label>E-mail<input name="email" type="email" value="${escapeHtml(user?.email || "")}" autocomplete="email"></label>
          <label>Telefoon<input name="phone" value="${escapeHtml(user?.phone || "")}" autocomplete="tel"></label>
          <label>Beschikbaarheid<select name="availabilityStatus">${option("ONLINE", user?.availabilityStatus, "Beschikbaar")}${option("FOCUS", user?.availabilityStatus, "Focus")}${option("AWAY", user?.availabilityStatus, "Afwezig")}</select></label>
          <label>Focusgebied<input name="focusArea" value="${escapeHtml(user?.focusArea || "")}" placeholder="Bijv. orderkwaliteit, winnaars, conversie"></label>
          <label class="wide">Profielfoto URL<input name="avatarUrl" value="${escapeHtml(user?.avatarUrl || "")}" inputmode="url" placeholder="/uploads/... of https://...">
            <div class="profile-upload">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-profile-upload="avatarUrl" aria-label="Upload profielfoto">
              <span class="widget-upload-status" data-profile-upload-status>Max 4MB</span>
            </div>
          </label>
          <label class="wide">Korte bio<textarea name="bio" maxlength="360" placeholder="Waarvoor kan het team jou taggen?">${escapeHtml(user?.bio || "")}</textarea></label>
        </div>
        <div class="actions" style="justify-content:flex-start"><button class="button--gold" type="submit">${icon("Save")}Profiel opslaan</button><a class="button button--ghost" href="/admin/teamhub">${icon("MessagesSquare")}Teamhub</a></div>
      </div>
    </form>
    <script>
      (() => {
        const form = document.querySelector("[data-profile-form]");
        const input = form?.querySelector("[data-profile-upload]");
        if (!form || !input) return;
        input.addEventListener("change", async () => {
          const file = input.files && input.files[0];
          const target = form.querySelector('[name="' + input.dataset.profileUpload + '"]');
          const status = form.querySelector("[data-profile-upload-status]");
          const csrf = form.querySelector('[name="_csrf"]')?.value || "";
          if (!file || !target || !status || !csrf) return;
          const body = new FormData();
          body.append("image", file);
          body.append("field", "adminAvatar");
          status.textContent = "Uploaden...";
          status.classList.remove("widget-upload-status--ok", "widget-upload-status--error");
          try {
            const response = await fetch("/admin/uploads", { method: "POST", headers: { "X-CSRF-Token": csrf }, body });
            const payload = await response.json();
            if (!response.ok || !payload.url) throw new Error(payload.error || "Upload mislukt.");
            target.value = payload.url;
            status.textContent = "Geupload";
            status.classList.add("widget-upload-status--ok");
          } catch (error) {
            status.textContent = error.message || "Upload mislukt";
            status.classList.add("widget-upload-status--error");
          } finally {
            input.value = "";
          }
        });
      })();
    </script>
    <div class="section-head" style="margin-top:22px"><h3>Security</h3><span class="muted">Ingelogd als ${escapeHtml(user?.username || "admin")} · ${escapeHtml(roleLabel(user?.role))}</span></div>
    <form method="post" action="/admin/account/password" class="form-grid">
      <label>Huidig wachtwoord<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>Nieuw wachtwoord<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label>
      <label>Herhaal nieuw wachtwoord<input name="confirmPassword" type="password" autocomplete="new-password" minlength="10" required></label>
      <div class="actions"><button class="button--gold" type="submit">${icon("KeyRound")}Wachtwoord wijzigen</button></div>
    </form>
    <div class="section-head" style="margin-top:20px"><h3>2FA</h3><span class="status status--${user?.totpEnabled ? "active" : setup ? "controle" : "private"}">${user?.totpEnabled ? "Actief" : setup ? "Setup open" : "Niet actief"}</span></div>
    ${setup ? `<div class="ops-item"><span class="ops-icon">${icon("QrCode")}</span><span><strong>Authenticator secret</strong><br><code class="code-line">${escapeHtml(setup.secret)}</code><span class="muted">Voeg dit toe in je authenticator en bevestig met een 6-cijferige code.</span></span><span></span></div>
      <form method="post" action="/admin/account/2fa/confirm" class="form-grid" style="margin-top:12px"><label>2FA-code<input name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><div class="actions"><button type="submit">${icon("ShieldCheck")}2FA bevestigen</button></div></form>` : ""}
    <div class="actions" style="justify-content:flex-start;margin-top:12px">
      ${user?.totpEnabled ? `<form method="post" action="/admin/account/2fa/disable" class="inline-form"><button class="button--ghost" type="submit">${icon("ShieldOff")}2FA uitzetten</button></form>` : `<form method="post" action="/admin/account/2fa/start" class="inline-form"><button class="button--ghost" type="submit">${icon("ShieldPlus")}2FA starten</button></form>`}
    </div>
  </section>`;
}

function createAccountPanel(canManage) {
  if (!canManage) {
    return `<section class="panel panel-pad"><div class="panel-title"><div><h2>Team uitnodigen</h2><p class="helper">Alleen teambeheerders kunnen admin uitnodigingen maken.</p></div></div></section>`;
  }
  return `<section class="panel panel-pad">
    <div class="panel-title"><div><h2>Team uitnodigen</h2><p class="helper">Maak een setup-link. De gebruiker kiest zelf een wachtwoord.</p></div></div>
    <form method="post" action="/admin/accounts/invites" class="form-grid">
      <label>E-mail<input name="email" type="email" autocomplete="off" required></label>
      <label>Naam<input name="name" autocomplete="off"></label>
      <label>Rol<select name="role">${option("ADMIN", "", "Admin")}${option("OWNER", "", "Eigenaar")}${option("VIEWER", "", "Viewer")}</select></label>
      <label>Geldig voor<select name="expiresInHours">${option("72", "", "72 uur")}${option("24", "", "24 uur")}${option("168", "", "7 dagen")}</select></label>
      <div class="wide">${permissionCheckboxes("permissions", [])}</div>
      <div class="actions wide"><button class="button--gold" type="submit">${icon("UserPlus")}Uitnodiging maken</button></div>
    </form>
  </section>`;
}

function accountRows(users, currentUser, canManage) {
  if (!users.length) return `<tr><td colspan="7">Nog geen accounts.</td></tr>`;
  return users.map((user) => {
    const isSelf = user.id === currentUser?.id;
    return `<tr>
      <td><div class="avatar-row">${avatar(user)}<span><strong>${escapeHtml(user.name || user.username)}</strong><span class="muted">${escapeHtml(user.title || user.email || "Geen profielinfo")}</span></span></div></td>
      <td>${statusBadge(user.status === "ACTIVE" ? "active" : "void")}</td>
      <td><span class="status">${escapeHtml(roleLabel(user.role))}</span></td>
      <td>${escapeHtml(formatShortDate(user.lastLoginAt))}</td>
      <td>${user.forcePasswordChange ? '<span class="status status--controle">Moet wijzigen</span>' : '<span class="status status--goed">Normaal</span>'}</td>
      <td>
        <form method="post" action="/admin/accounts/${escapeHtml(user.id)}/update" class="stack">
          <div class="form-grid">
            <label>Naam<input name="name" value="${escapeHtml(user.name)}"${canManage ? "" : " disabled"}></label>
            <label>Functie<input name="title" value="${escapeHtml(user.title || "")}"${canManage ? "" : " disabled"}></label>
            <label>E-mail<input name="email" type="email" value="${escapeHtml(user.email)}"${canManage ? "" : " disabled"}></label>
            <label>Rol<select name="role"${canManage ? "" : " disabled"}>${option("OWNER", user.role, "Eigenaar")}${option("ADMIN", user.role, "Admin")}${option("VIEWER", user.role, "Viewer")}</select></label>
            <label>Status<select name="status"${canManage || isSelf ? "" : " disabled"}>${option("ACTIVE", user.status, "Actief")}${option("SUSPENDED", user.status, "Geblokkeerd")}</select></label>
            <label class="structure-toggle"><input type="checkbox" name="forcePasswordChange" value="1"${user.forcePasswordChange ? " checked" : ""}${canManage ? "" : " disabled"}> Wachtwoord reset verplichten</label>
            <div class="wide">${permissionCheckboxes("permissions", user.permissions, !canManage)}</div>
          </div>
          <div class="actions">${canManage ? `<button type="submit">${icon("Save")}Opslaan</button>` : ""}</div>
        </form>
      </td>
      <td>
        ${canManage ? `<form method="post" action="/admin/accounts/${escapeHtml(user.id)}/reset-link" class="stack">
          <button class="button--ghost" type="submit">${icon("Link")}Resetlink maken</button>
        </form>` : ""}
      </td>
    </tr>`;
  }).join("");
}

function inviteRows(invites) {
  if (!invites.length) return `<tr><td colspan="6"><div class="empty">Geen uitnodigingen.</div></td></tr>`;
  return invites.map((invite) => {
    const state = invite.acceptedAt ? ["active", "Geaccepteerd"] : invite.revokedAt ? ["void", "Ingetrokken"] : invite.expiresAt <= new Date().toISOString() ? ["void", "Verlopen"] : ["controle", "Open"];
    return `<tr>
      <td><strong>${escapeHtml(invite.email)}</strong><span class="muted">${escapeHtml(invite.name || invite.teamName)}</span></td>
      <td><span class="status status--${state[0]}">${state[1]}</span></td>
      <td>${escapeHtml(roleLabel(invite.role))}</td>
      <td>${permissionSummary(invite.permissions)}</td>
      <td>${escapeHtml(formatShortDate(invite.expiresAt))}</td>
      <td>${!invite.acceptedAt && !invite.revokedAt ? `<form method="post" action="/admin/accounts/invites/${escapeHtml(invite.id)}/revoke" class="inline-form"><button class="button--ghost" type="submit">${icon("Ban")}Intrekken</button></form><span class="muted">Link niet opnieuw toonbaar. Maak opnieuw indien kwijt.</span>` : ""}</td>
    </tr>`;
  }).join("");
}

function resetRows(resets) {
  if (!resets.length) return `<tr><td colspan="5"><div class="empty">Geen actieve resetlinks.</div></td></tr>`;
  return resets.map((reset) => {
    const state = reset.usedAt ? ["active", "Gebruikt"] : reset.revokedAt ? ["void", "Ingetrokken"] : ["controle", "Open"];
    return `<tr>
      <td><strong>${escapeHtml(reset.username)}</strong><span class="muted">Aangevraagd door ${escapeHtml(reset.requestedBy || "-")}</span></td>
      <td><span class="status status--${state[0]}">${state[1]}</span></td>
      <td>${escapeHtml(formatShortDate(reset.expiresAt))}</td>
      <td>${escapeHtml(formatShortDate(reset.createdAt))}</td>
      <td><span class="muted">Link is alleen zichtbaar bij aanmaken.</span></td>
    </tr>`;
  }).join("");
}

function filteredAuditRows({ action = "", actorName = "", limit = 40 } = {}) {
  const filters = [];
  const params = {};
  if (action) {
    filters.push("action LIKE @action");
    params.action = `%${action}%`;
  }
  if (actorName) {
    filters.push("actor LIKE @actor");
    params.actor = `%${actorName}%`;
  }
  params.limit = limit;
  return db.prepare(`
    SELECT *
    FROM audit_logs
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT @limit
  `).all(params);
}

function auditSecurityRows(logs) {
  if (!logs.length) return `<tr><td colspan="5"><div class="empty">Geen auditregels gevonden.</div></td></tr>`;
  return logs.map((log) => `<tr>
    <td>${escapeHtml(formatShortDate(log.created_at))}</td>
    <td><strong>${escapeHtml(log.action)}</strong><span class="muted">${escapeHtml(log.actor)}</span></td>
    <td>${escapeHtml(log.target_type || "-")}<br><span class="muted">${escapeHtml(log.target_id || "-")}</span></td>
    <td>${escapeHtml(log.message || "-")}</td>
    <td><span class="muted">${escapeHtml(String(log.metadata || "").slice(0, 90))}</span></td>
  </tr>`).join("");
}

function sessionRows(sessions, currentSessionId, canManage) {
  if (!sessions.length) return `<tr><td colspan="6">Geen actieve sessies.</td></tr>`;
  return sessions.map((session) => {
    const isCurrent = session.id === currentSessionId;
    return `<tr>
      <td><strong>${escapeHtml(session.username)}</strong><span class="muted">${escapeHtml(roleLabel(session.role))}${isCurrent ? " · huidige sessie" : ""}</span></td>
      <td>${session.revokedAt ? '<span class="status status--void">Ingetrokken</span>' : '<span class="status status--active">Actief</span>'}</td>
      <td>${escapeHtml(formatShortDate(session.lastSeenAt))}</td>
      <td>${escapeHtml(session.ip || "-")}</td>
      <td><span class="muted">${escapeHtml((session.userAgent || "-").slice(0, 84))}</span></td>
      <td>${canManage && !session.revokedAt && !isCurrent ? `<form method="post" action="/admin/accounts/sessions/${escapeHtml(session.id)}/revoke" class="inline-form"><button class="button--ghost" type="submit">${icon("Ban")}Intrekken</button></form>` : ""}</td>
    </tr>`;
  }).join("");
}

function teamCards(users) {
  if (!users.length) return `<div class="empty">Nog geen teamleden.</div>`;
  return `<div class="team-grid">${users.map((user) => `<article class="team-card">
    <div class="team-card-head">
      <div class="team-person">${avatar(user)}<span><strong>${escapeHtml(user.name || user.username)}</strong><small>${escapeHtml(user.title || roleLabel(user.role))}</small></span></div>
      <span class="presence ${availabilityClass(user.availabilityStatus)}">${escapeHtml(availabilityLabel(user.availabilityStatus))}</span>
    </div>
    <p class="muted">${escapeHtml(user.focusArea || "Geen focusgebied ingesteld.")}</p>
    ${user.bio ? `<p>${escapeHtml(user.bio)}</p>` : ""}
  </article>`).join("")}</div>`;
}

function threadCards(threads, activeThreadId = "") {
  if (!threads.length) return `<div class="empty">Nog geen KPI-discussies. Start er een wanneer een metric aandacht nodig heeft.</div>`;
  return `<div class="thread-list">${threads.map((thread) => `<a class="thread-card${thread.id === activeThreadId ? " thread-card--active" : ""}" href="/admin/teamhub?thread=${encodeURIComponent(thread.id)}">
    <div class="thread-card-head">
      <strong>${escapeHtml(thread.title)}</strong>
      <span class="status status--${threadStatusClass(thread.status)}">${escapeHtml(threadStatusLabel(thread.status))}</span>
    </div>
    <div class="thread-meta">
      <span class="status">${escapeHtml(kpiLabel(thread.kpi_key))}</span>
      <span class="status status--${priorityStatusClass(thread.priority)}">${escapeHtml(priorityLabel(thread.priority))}</span>
      <span class="muted">${Number(thread.message_count || 0)} bericht(en)</span>
    </div>
    <div class="avatar-row">${avatar({ name: thread.creator_name, username: thread.creator_username, avatar_url: thread.creator_avatar_url })}<span class="muted">Laatste update ${escapeHtml(formatShortDate(thread.last_message_at || thread.updated_at))}</span></div>
  </a>`).join("")}</div>`;
}

function messageRows(messages) {
  if (!messages.length) return `<div class="empty">Nog geen berichten.</div>`;
  return messages.map((message) => `<article class="message">
    ${avatar({ name: message.name, username: message.username, avatar_url: message.avatar_url })}
    <div class="message-bubble">
      <header><strong>${escapeHtml(message.name || message.username || "Admin")}</strong><span class="muted">${escapeHtml(formatShortDate(message.created_at))}</span></header>
      <p>${escapeHtml(message.body)}</p>
    </div>
  </article>`).join("");
}

function threadPanel(thread, messages, users, canManage) {
  if (!thread) {
    return `<section class="panel panel-pad discussion-panel">
      <div class="panel-title"><div><h2>Kies een KPI-discussie</h2><p class="helper">Gebruik dit voor beslissingen rond loten, orders, conversie, winners en compliance.</p></div></div>
      <div class="empty">Selecteer links een gesprek of start een nieuwe discussie.</div>
    </section>`;
  }
  return `<section class="panel discussion-panel">
    <div class="panel-pad">
      <div class="panel-title">
        <div>
          <p class="eyebrow">${escapeHtml(kpiLabel(thread.kpi_key))}</p>
          <h2>${escapeHtml(thread.title)}</h2>
          <p class="helper">Gestart door ${escapeHtml(thread.creator_name || thread.creator_username || "admin")} · bijgewerkt ${escapeHtml(formatShortDate(thread.updated_at))}</p>
        </div>
        <div class="actions">
          <span class="status status--${priorityStatusClass(thread.priority)}">${escapeHtml(priorityLabel(thread.priority))}</span>
          <span class="status status--${threadStatusClass(thread.status)}">${escapeHtml(threadStatusLabel(thread.status))}</span>
        </div>
      </div>
      ${canManage ? `<form method="post" action="/admin/teamhub/threads/${escapeHtml(thread.id)}/status" class="filter-grid">
        <label>Status<select name="status">${option("OPEN", thread.status, "Open")}${option("WATCHING", thread.status, "Monitor")}${option("RESOLVED", thread.status, "Afgerond")}</select></label>
        <label>Prioriteit<select name="priority">${option("LOW", thread.priority, "Laag")}${option("NORMAL", thread.priority, "Normaal")}${option("HIGH", thread.priority, "Hoog")}${option("URGENT", thread.priority, "Urgent")}</select></label>
        <label>Eigenaar<select name="assignedTo"><option value="">Geen eigenaar</option>${users.map((user) => option(user.id, thread.assigned_to, user.name || user.username)).join("")}</select></label>
        <div class="actions"><button type="submit">${icon("Save")}Bijwerken</button></div>
      </form>` : ""}
    </div>
    <div class="message-list">${messageRows(messages)}</div>
    ${canManage ? `<form method="post" action="/admin/teamhub/threads/${escapeHtml(thread.id)}/messages" class="message-form">
      <label>Nieuw bericht<textarea name="body" placeholder="Wat is de conclusie, blokkade of actie?"></textarea></label>
      <button class="button--gold" type="submit">${icon("Send")}Plaatsen</button>
    </form>` : `<div class="panel-pad"><p class="muted">Je hebt alleen leesrechten voor KPI-discussies.</p></div>`}
  </section>`;
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

function winnerAdminRows(limit = 40) {
  return db.prepare(`
    SELECT
      d.id AS draw_id,
      d.title AS draw_title,
      d.prize_name,
      d.prize_value,
      d.draw_at,
      d.status AS draw_status,
      d.winner_public_status,
      d.winner_public_name,
      d.winner_public_statement,
      d.winner_public_image_url,
      d.winner_public_approved_at,
      d.winner_contact_status,
      d.winner_consent_status,
      d.winner_consent_reference,
      d.winner_internal_note,
      e.id AS entry_id,
      e.entry_number,
      e.source,
      e.created_at AS entry_created_at,
      c.first_name,
      c.last_name,
      c.email,
      c.shopify_customer_id,
      o.order_name,
      o.total_cents
    FROM lottery_draws d
    JOIN lottery_entries e ON e.id = d.winner_entry_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.status = 'WINNER'
    ORDER BY COALESCE(d.draw_at, e.created_at) DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(120, Number(limit || 40))));
}

function winnerPublicName(row) {
  const firstName = textParam(row.first_name);
  if (firstName) return firstName;
  if (row.email) return `${String(row.email).slice(0, 2)}***`;
  return "Winnaar";
}

function winnerFullName(row) {
  return [row.first_name, row.last_name].map(textParam).filter(Boolean).join(" ") || winnerPublicName(row);
}

function manualWinnerCards(settings) {
  return [
    ["winnerOneName", "winnerOnePrize", "winnerOneStory", "winnerOneImageUrl"],
    ["winnerTwoName", "winnerTwoPrize", "winnerTwoStory", "winnerTwoImageUrl"],
    ["winnerThreeName", "winnerThreePrize", "winnerThreeStory", "winnerThreeImageUrl"],
    ["winnerFourName", "winnerFourPrize", "winnerFourStory", "winnerFourImageUrl"]
  ].map(([nameKey, prizeKey, storyKey, imageKey], index) => ({
    index: index + 1,
    name: textParam(settings[nameKey]),
    prize: textParam(settings[prizeKey]),
    story: textParam(settings[storyKey]),
    imageUrl: textParam(settings[imageKey])
  })).filter((card) => card.name || card.prize || card.story || card.imageUrl);
}

function winnerPublicationState(settings, rows) {
  const source = textParam(settings.winnerSource) === "manual" ? "manual" : "automatic";
  const manualCards = manualWinnerCards(settings);
  const publicRows = rows.filter((row) => row.winner_public_status === "PUBLIC" && row.winner_consent_status === "APPROVED" && textParam(row.winner_public_name) && textParam(row.winner_public_statement));
  if (source === "manual") {
    if (!manualCards.length) return { source, manualCards, status: "Actie", note: "Handmatige bron staat aan, maar er zijn nog geen publiceerbare kaarten ingevuld." };
    const missingStory = manualCards.filter((card) => !card.story).length;
    const missingImage = manualCards.filter((card) => !card.imageUrl).length;
    if (missingStory || missingImage) return { source, manualCards, status: "Controle", note: `${manualCards.length} kaart(en), ${missingStory} zonder statement en ${missingImage} zonder foto.` };
    return { source, manualCards, status: "Goed", note: `${manualCards.length} handmatige winnaarkaart(en) klaar voor de widget.` };
  }
  if (!rows.length) return { source, manualCards, publicRows, status: "Controle", note: "Automatisch staat aan, maar er is nog geen getrokken winnaar om te tonen." };
  if (!publicRows.length) return { source, manualCards, publicRows, status: "Actie", note: "Automatisch staat aan, maar nog geen winnaar is publiek goedgekeurd." };
  return { source, manualCards, publicRows, status: "Goed", note: `${publicRows.length} goedgekeurde winnaar(s) klaar voor automatische publicatie.` };
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

function winnerPublishSignal(row) {
  if (row.winner_consent_status !== "APPROVED") return ["Controle", "Consent niet goedgekeurd"];
  if (row.winner_public_status !== "PUBLIC") return ["Controle", "Niet publiek goedgekeurd"];
  if (!textParam(row.winner_public_name)) return ["Actie", "Publieke naam ontbreekt"];
  if (!textParam(row.winner_public_statement)) return ["Actie", "Statement ontbreekt"];
  if (!textParam(row.winner_public_image_url)) return ["Controle", "Publiek zonder foto"];
  if (!row.draw_at) return ["Controle", "Trekdatum ontbreekt"];
  if (!row.first_name && !row.email) return ["Controle", "Geen naam/e-mail gekoppeld"];
  if (!row.order_name && row.source === "ORDER_THRESHOLD") return ["Controle", "Orderlot zonder ordernaam"];
  return ["Goed", "Publiek goedgekeurd"];
}

function normalizeDrawStatusInput(status, draw = null) {
  const next = textParam(status);
  if (next === "DRAWN") {
    return draw?.winner_entry_id ? "DRAWN" : draw?.status || "DRAFT";
  }
  return editableDrawStatuses.includes(next) ? next : draw?.status || "DRAFT";
}

function drawChecklist(draw, counts = []) {
  const activeEntries = Number(counts.find((row) => row.status === "ACTIVE")?.count || 0);
  const checks = [
    ["Prijs ingevuld", Boolean(textParam(draw.prize_name)), "Prijsnaam staat klaar."],
    ["Klanttekst", textParam(draw.description).length >= 20, "Beschrijving is lang genoeg voor de publieke uitleg."],
    ["Planning", Boolean(draw.starts_at && (draw.ends_at || draw.draw_at)), "Startdatum plus eind- of trekdatum."],
    ["Loten", activeEntries > 0, `${activeEntries} actieve loten.`],
    ["Winnaar", draw.status !== "DRAWN" || Boolean(draw.winner_entry_id), "Getrokken acties moeten een winnaar hebben."]
  ];
  const ready = checks.every((check) => check[1]);
  return { checks, ready, activeEntries };
}

function kpiGrid(items, className = "") {
  const tints = ["card--tint-0", "card--tint-1", "card--tint-2", "card--tint-3"];
  return `<section class="grid${className ? ` ${escapeHtml(className)}` : ""}" aria-label="Kerncijfers">${items.map((item, index) => {
    const value = String(item.value ?? "-");
    const isTextValue = /[A-Za-zÀ-ÿ]/.test(value);
    return `<div class="card ${tints[index % tints.length]}">
      <div class="card-head"><p class="muted">${escapeHtml(item.label)}</p><span class="card-icon">${icon(item.icon || "Activity")}</span></div>
      <div class="stat${isTextValue ? " stat--text" : ""}">${escapeHtml(value)}</div>
      <p>${escapeHtml(item.help)}</p>
    </div>`;
  }).join("")}</section>`;
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

function analyticsActionLabel(action) {
  const labels = {
    view: "Widget view",
    cta_click: "CTA klik",
    product_open: "Product geopend",
    product_add_attempt: "Add-to-cart poging",
    product_add_success: "Add-to-cart gelukt",
    product_add_error: "Add-to-cart fout",
    free_entry_submit: "Gratis deelname start",
    free_entry_success: "Gratis deelname gelukt",
    free_entry_error: "Gratis deelname fout",
    cart_threshold_reached: "Gratis lot bereikt"
  };
  return labels[action] || action || "-";
}

function eventRate(part, total) {
  if (!Number(total || 0)) return "0%";
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 100)}%`;
}

function analyticsFunnelPanel(summary) {
  const totals = summary.totals;
  const rows = [
    ["Views", totals.views, 100],
    ["Kliks", totals.clicks, ratio(totals.clicks, totals.views || 1)],
    ["Add-to-cart success", totals.addSuccesses, ratio(totals.addSuccesses, totals.addAttempts || 1)],
    ["Gratis deelname success", totals.freeEntrySuccesses, ratio(totals.freeEntrySuccesses, totals.freeEntrySubmits || 1)]
  ];
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Conversie</p><h2>Widget funnel</h2></div><span class="status">${summary.days} dagen</span></div>
    <div class="stack">
      ${rows.map(([label, value, width]) => `<div class="metric-row">
        <div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
        <div class="bar"><span style="width:${width}%"></span></div>
      </div>`).join("")}
    </div>
    <p class="helper">Meet shopinteractie zonder klantdata op te slaan.</p>
  </div>`;
}

function analyticsWidgetTable(rows) {
  return `<table>
    <thead><tr><th>Widget</th><th>Views</th><th>Kliks</th><th>Add-to-cart</th><th>Gratis deelname</th><th>Laatst gezien</th></tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>
      <td><strong>${escapeHtml(row.widget)}</strong><span class="muted">${row.total_events || 0} events</span></td>
      <td>${row.views || 0}</td>
      <td>${row.clicks || 0}<br><span class="muted">${eventRate(row.clicks || 0, row.views || 0)}</span></td>
      <td>${row.add_successes || 0}</td>
      <td>${row.free_entry_successes || 0}</td>
      <td>${escapeHtml(row.last_seen || "-")}</td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Nog geen widget events. Zodra de live embed wordt bekeken, verschijnt dit hier.</div></td></tr>`}</tbody>
  </table>`;
}

function analyticsActionsTable(rows) {
  return `<table>
    <thead><tr><th>Actie</th><th>Widget</th><th>Aantal</th><th>Laatst gezien</th></tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>
      <td><strong>${escapeHtml(analyticsActionLabel(row.action))}</strong><span class="muted">${escapeHtml(row.action)}</span></td>
      <td>${escapeHtml(row.widget)}</td>
      <td>${row.count || 0}</td>
      <td>${escapeHtml(row.last_seen || "-")}</td>
    </tr>`).join("") : `<tr><td colspan="4"><div class="empty">Nog geen acties gemeten.</div></td></tr>`}</tbody>
  </table>`;
}

function analyticsPagesPanel(rows) {
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Pagina's</p><h2>Waar widgets gebruikt worden</h2></div></div>
    <div class="stack">
      ${rows.length ? rows.map((row) => `<div class="metric-row">
        <div><span>${escapeHtml(row.page_url)}</span><strong>${row.count}</strong></div>
        <div class="bar"><span style="width:${ratio(row.count, rows[0]?.count || 1)}%"></span></div>
      </div>`).join("") : `<p class="empty">Nog geen paginaevents.</p>`}
    </div>
  </div>`;
}

function readinessRows({ summary, productStatus, metrics, winnerRows, rule, siteStructure }) {
  const widgetViews = Number(summary.totals.views || 0);
  const publicWinners = winnerRows.filter((row) => row.winner_public_status === "PUBLIC").length;
  const activeHomeSections = siteStructure.homepageSections.filter((row) => row.enabled).length;
  return [
    ["Activity", "Tracking actief", widgetViews > 0, widgetViews ? `${widgetViews} widget views gemeten.` : "Wacht op live storefront verkeer of test de embed.", "/admin/embed"],
    ["Gift", "Live winactie", metrics.liveDraws > 0, metrics.liveDraws ? `${metrics.activeLiveEntries} actieve loten in live acties.` : "Maak of publiceer minimaal één live winactie.", "/admin/winacties"],
    ["Beef", "Productdata", productStatus.available >= 4 && !productStatus.stale, `${productStatus.available} beschikbare producten · ${productStatus.stale ? "sync ouder dan 24u" : "sync vers"}.`, "/admin/producten"],
    ["Trophy", "Social proof", publicWinners > 0, publicWinners ? `${publicWinners} publieke winnaar(s).` : "Publiceer pas na consent een echte winnaar.", "/admin/winnaars"],
    ["ShieldCheck", "Gratis deelname controle", Boolean(rule.FREE_ENTRY_ENABLED), rule.FREE_ENTRY_ENABLED ? "IP + e-mail beperking actief." : "Gratis deelname staat uit.", "/admin/regels"],
    ["LayoutTemplate", "Homepage structuur", activeHomeSections >= 5, `${activeHomeSections} homepageblokken actief.`, "/admin/site-structuur"]
  ];
}

function readinessPanel(rows) {
  const readyCount = rows.filter((row) => row[2]).length;
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Readiness</p><h2>Franchise live-check</h2></div><span class="status status--${readyCount === rows.length ? "goed" : "controle"}">${readyCount}/${rows.length}</span></div>
    <div class="stack">
      ${rows.map(([iconName, title, ready, body, href]) => `<a class="ops-item" href="${href}" style="text-decoration:none">
        <span class="ops-icon">${icon(iconName)}</span>
        <span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span>
        <span class="status status--${ready ? "goed" : "actie"}">${ready ? "Goed" : "Actie"}</span>
      </a>`).join("")}
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

function winnerRowsTable(rows) {
  return `<table>
    <thead><tr><th>Winnaar</th><th>Winactie</th><th>Prijs</th><th>Lot</th><th>Order</th><th>Publicatie</th></tr></thead>
    <tbody>${rows.map((row) => {
      const [badge, note] = winnerPublishSignal(row);
      return `<tr>
        <td><strong>${escapeHtml(winnerFullName(row))}</strong><span class="muted">${escapeHtml(row.email || row.shopify_customer_id || "Geen klantkoppeling")}</span></td>
        <td><a href="/admin/winacties/${escapeHtml(row.draw_id)}"><strong>${escapeHtml(row.draw_title)}</strong></a><span class="muted">${escapeHtml(row.draw_at ? row.draw_at.slice(0, 16).replace("T", " ") : "-")}</span></td>
        <td><strong>${escapeHtml(row.prize_name || "-")}</strong><span class="muted">${escapeHtml(row.prize_value || "-")}</span></td>
        <td><strong>${escapeHtml(row.entry_number)}</strong><span class="muted">${escapeHtml(statusLabel(row.source))}</span></td>
        <td>${escapeHtml(row.order_name || "-")}<br><span class="muted">${row.total_cents ? formatEuro(row.total_cents) : "-"}</span></td>
        <td>${statusBadge(badge)}<br><span class="muted">${escapeHtml(note)}</span></td>
      </tr>`;
    }).join("")}</tbody>
  </table>`;
}

function manualWinnerCardsPanel(cards) {
  return `<div class="panel panel-pad">
    <div class="panel-title"><div><p class="eyebrow">Handmatig</p><h2>Goedgekeurde kaarten</h2></div><span class="status">${cards.length}/4</span></div>
    <div class="stack">
      ${cards.length ? cards.map((card) => `<div class="ops-item">
        <span class="ops-icon">${icon(card.imageUrl ? "Image" : "UserRound")}</span>
        <span><strong>${escapeHtml(card.name || `Kaart ${card.index}`)}</strong><br><span class="muted">${escapeHtml(card.prize || "Geen prijs")} · ${escapeHtml(card.story ? "Statement ingevuld" : "Statement mist")}</span></span>
        <span class="status status--${card.story && card.imageUrl ? "goed" : "controle"}">${card.story && card.imageUrl ? "Klaar" : "Check"}</span>
      </div>`).join("") : `<div class="empty">Geen handmatige winnaarkaarten ingevuld. Gebruik dit alleen voor winnaars met goedgekeurde naam, foto en statement.</div>`}
    </div>
  </div>`;
}

function winnerPublicationCards(rows) {
  if (!rows.length) return `<div class="empty">Nog geen winnaars om te publiceren.</div>`;
  const contactStatuses = ["NOT_CONTACTED", "CONTACTED", "REPLIED"];
  const consentStatuses = ["UNKNOWN", "REQUESTED", "APPROVED", "DECLINED"];
  return `<div class="winner-publication-list">
    ${rows.map((row) => {
      const status = row.winner_public_status === "PUBLIC" ? "PUBLIC" : "PRIVATE";
      const contactStatus = contactStatuses.includes(row.winner_contact_status) ? row.winner_contact_status : "NOT_CONTACTED";
      const consentStatus = consentStatuses.includes(row.winner_consent_status) ? row.winner_consent_status : "UNKNOWN";
      const publicName = textParam(row.winner_public_name) || winnerPublicName(row);
      const statement = textParam(row.winner_public_statement);
      const imageUrl = textParam(row.winner_public_image_url);
      const consentReference = textParam(row.winner_consent_reference);
      const internalNote = textParam(row.winner_internal_note);
      const preview = imageUrl
        ? `<span class="winner-image-preview"><img src="${escapeHtml(imageUrl)}" alt=""></span>`
        : `<span class="winner-image-preview winner-image-preview--empty">${icon("Image")}</span>`;
      return `<article class="winner-publication-card">
        <div class="winner-publication-head">
          <div>
            <strong>${escapeHtml(winnerFullName(row))}</strong>
            <p class="muted">${escapeHtml(row.draw_title)} · ${escapeHtml(row.prize_name || "Prijs")}</p>
            <div class="winner-publication-meta">
              ${statusBadge(status)}
              ${statusBadge(contactStatus)}
              ${statusBadge(consentStatus)}
              <span class="status">${escapeHtml(row.entry_number)}</span>
              ${row.winner_public_approved_at ? `<span class="status status--goed">Goedgekeurd</span>` : ""}
            </div>
          </div>
          ${preview}
        </div>
        <form method="post" action="/admin/winnaars/${escapeHtml(row.draw_id)}/publication" class="form-grid">
          <label>Contactstatus<select name="contactStatus">${contactStatuses.map((item) => option(item, contactStatus, statusLabel(item))).join("")}</select></label>
          <label>Consent<select name="consentStatus">${consentStatuses.map((item) => option(item, consentStatus, statusLabel(item))).join("")}</select></label>
          <label class="wide">Consent referentie<input name="consentReference" value="${escapeHtml(consentReference)}" placeholder="Bijv. e-mail akkoord, Shopify note of ondertekend bestand"></label>
          <label>Status<select name="publicStatus">${option("PRIVATE", status, "Privé houden")}${option("PUBLIC", status, "Publiek tonen")}</select></label>
          <label>Publieke naam<input name="publicName" value="${escapeHtml(publicName)}" placeholder="${escapeHtml(winnerPublicName(row))}"></label>
          <label class="wide">Statement<textarea name="publicStatement" placeholder="Bijv. &quot;Ik had net BBQ-vlees besteld en kreeg ineens de mail dat ik had gewonnen.&quot;">${escapeHtml(statement)}</textarea></label>
          <label class="wide">Foto<input name="publicImageUrl" value="${escapeHtml(imageUrl)}" inputmode="url" placeholder="/uploads/... of Shopify CDN URL">
            <div class="widget-upload">
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-winner-upload="publicImageUrl" aria-label="Upload winnaar foto">
              <span class="widget-upload-status" data-winner-upload-status>Max 4MB</span>
            </div>
          </label>
          <label class="wide">Interne notitie<textarea name="internalNote" placeholder="Alleen intern: contactmoment, voorkeuren, opvolging.">${escapeHtml(internalNote)}</textarea></label>
          <p class="winner-publication-note">Publiek tonen werkt alleen met goedgekeurde consent, publieke naam en echt statement. Geen klanten of toestemming betekent: niet publiceren.</p>
          <div class="winner-publication-actions">
            <span class="helper">Foto en statement pas invullen wanneer de winnaar akkoord heeft gegeven.</span>
            <button type="submit">${icon("Save")}Opslaan</button>
          </div>
        </form>
      </article>`;
    }).join("")}
  </div>`;
}

function winnerPublicationUploadScript() {
  return `<script>
    (() => {
      document.querySelectorAll("[data-winner-upload]").forEach((input) => {
        input.addEventListener("change", async () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const form = input.closest("form");
          const target = form && form.querySelector('input[name="' + input.dataset.winnerUpload + '"]');
          const status = form && form.querySelector("[data-winner-upload-status]");
          const csrf = form && form.querySelector('input[name="_csrf"]');
          if (!form || !target || !csrf) return;
          const body = new FormData();
          body.append("image", file);
          body.append("field", input.dataset.winnerUpload || "winnerImage");
          status.textContent = "Uploaden...";
          status.classList.remove("widget-upload-status--ok", "widget-upload-status--error");
          try {
            const response = await fetch("/admin/uploads", { method: "POST", headers: { "X-CSRF-Token": csrf.value }, body });
            const result = await response.json();
            if (!response.ok || !result.url) throw new Error(result.error || "Upload mislukt");
            target.value = result.url;
            status.textContent = "Geüpload";
            status.classList.add("widget-upload-status--ok");
          } catch (error) {
            status.textContent = error.message || "Upload mislukt";
            status.classList.add("widget-upload-status--error");
          }
        });
      });
    })();
  </script>`;
}

function auditRows(limit = 10) {
  return db.prepare(`
    SELECT *
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function securityEventLabel(type) {
  const labels = {
    FREE_ENTRY_RATE_LIMIT: "Gratis deelname rate-limit",
    FREE_ENTRY_ATTEMPT_LIMIT: "Gratis deelname poginglimiet",
    FREE_ENTRY_DUPLICATE_OR_BLOCKED: "Dubbel of geblokkeerd gratis lot",
    INTERNAL_WRITE_RATE_LIMIT: "Interne schrijf rate-limit"
  };
  return labels[type] || type || "-";
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

function productFilter(req) {
  return {
    q: textParam(req.query.q),
    statusTag: textParam(req.query.statusTag),
    available: textParam(req.query.available)
  };
}

function productSalesRows(limit = 12) {
  return db.prepare(`
    SELECT
      COALESCE(NULLIF(oi.shopify_product_id, ''), oi.title) AS product_key,
      oi.shopify_product_id,
      oi.shopify_variant_id,
      COALESCE(sp.title, oi.title) AS title,
      sp.handle,
      sp.image_url,
      sp.status_tag,
      SUM(oi.quantity) AS quantity_sold,
      COUNT(DISTINCT oi.order_id) AS order_count,
      SUM(oi.total_cents) AS revenue_cents,
      MAX(o.created_at) AS last_order_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN shopify_products sp ON sp.shopify_product_id = oi.shopify_product_id
    GROUP BY product_key
    ORDER BY revenue_cents DESC, quantity_sold DESC, last_order_at DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(100, Number(limit || 12))));
}

function productSalesSummary() {
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS line_count,
      COUNT(DISTINCT order_id) AS order_count,
      COUNT(DISTINCT COALESCE(NULLIF(shopify_product_id, ''), title)) AS product_count,
      SUM(quantity) AS quantity_sold,
      SUM(total_cents) AS revenue_cents
    FROM order_items
  `).get();
  const top = productSalesRows(1)[0] || null;
  return {
    lineCount: Number(summary?.line_count || 0),
    orderCount: Number(summary?.order_count || 0),
    productCount: Number(summary?.product_count || 0),
    quantitySold: Number(summary?.quantity_sold || 0),
    revenueCents: Number(summary?.revenue_cents || 0),
    top
  };
}

function checkbox(body, name) {
  return body?.[name] === "true";
}

function structureInput(name, value, labelText = "", className = "") {
  return `<label${className ? ` class="${className}"` : ""}>${escapeHtml(labelText || name)}<input name="${escapeHtml(name)}" value="${escapeHtml(value)}"></label>`;
}

function structureTextarea(name, value, labelText = "") {
  return `<label class="wide">${escapeHtml(labelText || name)}<textarea name="${escapeHtml(name)}">${escapeHtml(value)}</textarea></label>`;
}

function structureToggle(name, checked, labelText = "Actief") {
  return `<label class="structure-toggle"><input type="checkbox" name="${escapeHtml(name)}" value="true"${checked ? " checked" : ""}>${escapeHtml(labelText)}</label>`;
}

function siteStructureFromBody(body) {
  const current = getSiteStructure();
  const byPrefix = (prefix, row, fields) => fields.reduce((next, field) => {
    next[field] = textParam(body[`${prefix}${field}:${row.key}`]) || row[field] || "";
    return next;
  }, { key: row.key });
  return {
    homepageSections: current.homepageSections.map((row) => ({
      ...row,
      ...byPrefix("section", row, ["label", "widget", "placement", "purpose"]),
      enabled: checkbox(body, `sectionEnabled:${row.key}`)
    })),
    headerMenu: current.headerMenu.map((row) => ({
      ...row,
      ...byPrefix("nav", row, ["label", "url", "group"]),
      visible: checkbox(body, `navVisible:${row.key}`)
    })),
    infoPages: current.infoPages.map((row) => ({
      ...row,
      ...byPrefix("page", row, ["title", "url", "status", "purpose"]),
      inHeader: checkbox(body, `pageInHeader:${row.key}`)
    })),
    productCards: {
      enabled: checkbox(body, "productCardsEnabled"),
      directAddEnabled: checkbox(body, "productDirectAddEnabled"),
      showSavings: checkbox(body, "productShowSavings"),
      showLotProgress: checkbox(body, "productShowLotProgress"),
      showDetailsLink: checkbox(body, "productShowDetailsLink"),
      placement: textParam(body.productPlacement),
      note: textParam(body.productNote)
    }
  };
}

function siteStructureSnippet(type) {
  if (type === "product-cards") return '<div data-dvl-lottery="product-cards"></div>';
  if (type === "pdp") return '<div data-dvl-lottery="pdp" data-product-price-cents="{{ product.price }}" data-product-title="{{ product.title | escape }}" data-product-image="{{ product.featured_image | image_url: width: 180 }}" data-product-url="{{ product.url }}"></div>';
  return `<div data-dvl-lottery="${escapeHtml(type)}"></div>`;
}

function siteStructurePage() {
  const structure = getSiteStructure();
  const activeSections = structure.homepageSections.filter((row) => row.enabled).length;
  const visibleNav = structure.headerMenu.filter((row) => row.visible).length;
  const livePages = structure.infoPages.filter((row) => row.status === "live").length;
  const productCardSettings = getWidgetSettings("product-cards");
  const productVariantsConfigured = ["One", "Two", "Three", "Four"].some((slot) => textParam(productCardSettings[`product${slot}VariantId`]));
  const productStatus = structure.productCards.directAddEnabled
    ? (productVariantsConfigured ? "Add-to-cart aan" : "Variant IDs nodig")
    : "Alleen productlink";

  return `
    ${topbar("Site structuur", "Homepage, header en informatiepagina's.", "Stuur wat Shopify laat zien vanuit één overzichtelijke plek. Widgets blijven los bewerkbaar, deze pagina bepaalt de site-opbouw.", `<a class="button button--ghost" href="/admin/widgets">${icon("PanelTop")}Widgets</a><a class="button button--gold" href="/admin/embed">${icon("ExternalLink")}Embed</a>`)}
    ${kpiGrid([
      { label: "Homepage blokken", value: activeSections, help: "Actieve secties in aanbevolen volgorde.", icon: "LayoutTemplate" },
      { label: "Header links", value: visibleNav, help: "Zichtbare menu-items voor Shopify.", icon: "Menu" },
      { label: "Live infopagina's", value: livePages, help: "Pagina's die klaar horen te staan.", icon: "FileText" },
      { label: "Productkaarten", value: productStatus, help: "Meat For More-achtige kaartactie.", icon: "ShoppingBag" }
    ])}
    <form method="post" action="/admin/site-structuur" class="stack">
      <section class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Homepage</p><h2>Volgorde en doel per blok</h2><p class="helper">Plaats in Shopify de widgets in deze volgorde. Dit houdt de homepage verkoopgericht en uitlegbaar.</p></div></div>
        <div class="structure-grid">
          ${structure.homepageSections.map((row) => `<div class="structure-row">
            <div>
              ${structureToggle(`sectionEnabled:${row.key}`, row.enabled, "Tonen")}
              <span class="status">${escapeHtml(row.widget)}</span>
            </div>
            ${structureInput(`sectionlabel:${row.key}`, row.label, "Label")}
            ${structureInput(`sectionplacement:${row.key}`, row.placement, "Plaatsing")}
            ${structureTextarea(`sectionpurpose:${row.key}`, row.purpose, "Waarom dit blok bestaat")}
            <input type="hidden" name="sectionwidget:${escapeHtml(row.key)}" value="${escapeHtml(row.widget)}">
          </div>`).join("")}
        </div>
      </section>
      <section class="grid grid-2">
        <div class="panel panel-pad">
          <div class="panel-title"><div><p class="eyebrow">Header menu</p><h2>Shopify navigatie</h2><p class="helper">Gebruik deze labels en URL's in het Shopify hoofdmenu. Hoofdmenu blijft kort, winactie-details gaan in dropdown.</p></div></div>
          <div class="structure-grid">
            ${structure.headerMenu.map((row) => `<div class="structure-row structure-row--compact">
              ${structureToggle(`navVisible:${row.key}`, row.visible, "Zichtbaar")}
              ${structureInput(`navlabel:${row.key}`, row.label, "Label")}
              ${structureInput(`navurl:${row.key}`, row.url, "URL")}
              ${structureInput(`navgroup:${row.key}`, row.group, "Groep")}
            </div>`).join("")}
          </div>
        </div>
        <div class="panel panel-pad">
          <div class="panel-title"><div><p class="eyebrow">Productkaarten</p><h2>Homepage card gedrag</h2><p class="helper">Gebaseerd op de Meat For More homepage: korting, detail-link en direct add-to-cart. MFF voegt lot-progress toe.</p></div></div>
          <div class="form-grid">
            ${structureToggle("productCardsEnabled", structure.productCards.enabled, "Productkaarten tonen")}
            ${structureToggle("productDirectAddEnabled", structure.productCards.directAddEnabled, "Direct in winkelwagen")}
            ${structureToggle("productShowSavings", structure.productCards.showSavings, "Korting tonen")}
            ${structureToggle("productShowLotProgress", structure.productCards.showLotProgress, "Lot-progress tonen")}
            ${structureToggle("productShowDetailsLink", structure.productCards.showDetailsLink, "Details-link tonen")}
            ${structureInput("productPlacement", structure.productCards.placement, "Plaatsing", "wide")}
            ${structureTextarea("productNote", structure.productCards.note, "Interne notitie")}
          </div>
          <span class="code-line">${escapeHtml(siteStructureSnippet("product-cards"))}</span>
        </div>
      </section>
      <section class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Informatieve pagina's</p><h2>Pagina's die in header of dropdown horen</h2><p class="helper">Dit zijn de pagina's die vertrouwen, compliance en uitleg dragen. Footer mag juridisch dieper gaan, header blijft overzichtelijk.</p></div></div>
        <div class="structure-grid">
          ${structure.infoPages.map((row) => `<div class="structure-row">
            <div>
              ${structureToggle(`pageInHeader:${row.key}`, row.inHeader, "Menu")}
              <span class="status status--${row.status === "live" ? "active" : "pending"}">${escapeHtml(row.status === "live" ? "Live" : "Concept")}</span>
            </div>
            ${structureInput(`pagetitle:${row.key}`, row.title, "Titel")}
            <label>Status<select name="pagestatus:${escapeHtml(row.key)}">${option("live", row.status, "Live")}${option("concept", row.status, "Concept")}</select></label>
            ${structureInput(`pageurl:${row.key}`, row.url, "URL")}
            ${structureTextarea(`pagepurpose:${row.key}`, row.purpose, "Doel")}
          </div>`).join("")}
        </div>
      </section>
      <section class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Shopify snippets</p><h2>Embed volgorde voor homepage</h2></div></div>
        <span class="code-line">${escapeHtml(structure.homepageSections.filter((row) => row.enabled).map((row) => siteStructureSnippet(row.widget)).join("\n"))}</span>
      </section>
      <div class="actions"><button class="button--gold" type="submit">${icon("Save")}Site structuur opslaan</button></div>
    </form>
  `;
}

function routePermission(req) {
  const path = req.path;
  const method = req.method;
  if (path === "/menu" || path === "/account/profile" || path === "/account/password" || path.startsWith("/account/2fa")) return "";
  if (path === "/") return "view_dashboard";
  if (path.startsWith("/accounts")) return method === "GET" && path === "/accounts" ? "" : "manage_accounts";
  if (path.startsWith("/site-structuur")) return "manage_site";
  if (path.startsWith("/analyse") || path.startsWith("/groei")) return "view_analytics";
  if (path.startsWith("/winnaars")) return method === "GET" ? "view_winners" : "manage_winners";
  if (path.startsWith("/winacties") || path.startsWith("/new-draw") || path.startsWith("/draws")) return method === "GET" ? "view_draws" : "manage_draws";
  if (path.startsWith("/loten")) return method === "GET" ? "view_entries" : "manage_entries";
  if (path.startsWith("/orders")) return "view_orders";
  if (path.startsWith("/producten")) return "view_products";
  if (path.startsWith("/deelnemers")) return "view_participants";
  if (path.startsWith("/teamhub")) return method === "GET" ? "view_teamhub" : "manage_teamhub";
  if (path.startsWith("/compliance")) return "view_compliance";
  if (path.startsWith("/regels")) return "manage_rules";
  if (path.startsWith("/sync-products")) return "manage_products";
  if (path.startsWith("/sync") || path.startsWith("/reconcile") || path.startsWith("/sync-dashboards") || path.startsWith("/sync-order-items")) return "manage_sync";
  if (path.startsWith("/widgets")) return "manage_widgets";
  if (path.startsWith("/uploads")) return "manage_uploads";
  if (path.startsWith("/embed") || path.startsWith("/api")) return "view_dashboard";
  return "view_dashboard";
}

adminRouter.use((req, res, next) => {
  const permission = routePermission(req);
  if (!permission || hasAdminPermission(req.adminUser, permission)) return next();
  return res.status(403).send(page("Geen toegang | Meat For Free", "accounts", `
    ${topbar("Toegang", "Geen rechten voor deze pagina.", `Je mist de permissie: ${permissionLabel(permission)}. Vraag een eigenaar om je rol of permissies aan te passen.`, `<a class="button button--gold" href="/admin/accounts">${icon("UserCog")}Mijn account</a>`)}
  `));
});

adminRouter.get("/site-structuur", (_req, res) => {
  res.send(page("Site structuur | Meat For Free", "site", siteStructurePage()));
});

adminRouter.post("/site-structuur", urlencoded, (req, res) => {
  const structure = siteStructureFromBody(req.body || {});
  updateSiteStructure(structure);
  writeAuditLog({
    actor: "admin",
    action: "UPDATE_SITE_STRUCTURE",
    targetType: "site_structure",
    targetId: "site",
    message: "Homepage, header menu en informatiepagina's bijgewerkt."
  });
  res.redirect("/admin/site-structuur");
});

adminRouter.get("/", (_req, res) => {
  const metrics = getMetrics();
  const funnel = funnelMetrics();
  const productSales = productSalesSummary();
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
    ["Beef", `${productSales.lineCount} productregels`, productSales.lineCount ? `${formatEuro(productSales.revenueCents)} productomzet zichtbaar` : "Verrijk orderregels op de sync-pagina", productSales.lineCount ? "Data" : "Actie"],
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
          ${opsItems.map(([iconName, title, body, badge]) => {
            const href = iconName === "Beef" ? (productSales.lineCount ? "/admin/producten" : "/admin/sync") : "";
            const content = `<span class="ops-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${escapeHtml(badge)}</span>`;
            return href ? `<a class="ops-item" href="${href}" style="text-decoration:none">${content}</a>` : `<div class="ops-item">${content}</div>`;
          }).join("")}
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

adminRouter.get("/groei", (_req, res) => {
  const summary = analyticsSummary({ days: 14 });
  const metrics = getMetrics();
  const rule = getLotteryRule();
  const productStatus = productSyncStatus();
  const winnerRows = winnerAdminRows(60);
  const siteStructure = getSiteStructure();
  const actionItems = analyticsActionItems(summary);
  const readiness = readinessRows({ summary, productStatus, metrics, winnerRows, rule, siteStructure });
  const totals = summary.totals;

  res.send(page("Groei | Meat For Free", "groei", `
    ${topbar("Groei", "Conversie en live readiness.", "Geen Klaviyo: eerst meten wat de widgets zelf doen, waar bezoekers klikken en welke onderdelen klaar zijn om verkeer op te schalen.", `<a class="button button--ghost" href="/admin/groei/events.csv">${icon("Download")}CSV export</a><a class="button button--gold" href="/admin/widgets">${icon("PanelTop")}Widgets aanpassen</a>`)}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Actiepunten</p><h2>Wat nu verbeteren?</h2></div><span class="status">${summary.days} dagen</span></div>
        <div class="stack">${actionItems.map(([iconName, title, body, badge, href]) => `<a class="ops-item" href="${href}" style="text-decoration:none"><span class="ops-icon">${icon(iconName)}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${escapeHtml(badge)}</span></a>`).join("")}</div>
      </div>
      ${readinessPanel(readiness)}
    </section>
    ${kpiGrid([
      { label: "Widget views", value: totals.views || 0, help: `${totals.uniqueVisitors || 0} unieke gehashte bezoekersignalen.`, icon: "Eye" },
      { label: "Klikratio", value: eventRate(totals.clicks || 0, totals.views || 0), help: `${totals.clicks || 0} CTA/productkliks uit ${totals.views || 0} views.`, icon: "MousePointerClick" },
      { label: "Add-to-cart", value: eventRate(totals.addSuccesses || 0, totals.addAttempts || 0), help: `${totals.addSuccesses || 0} gelukt van ${totals.addAttempts || 0} pogingen.`, icon: "ShoppingCart" },
      { label: "Gratis deelname", value: eventRate(totals.freeEntrySuccesses || 0, totals.freeEntrySubmits || 0), help: `${totals.freeEntrySuccesses || 0} gelukt van ${totals.freeEntrySubmits || 0} aanvragen.`, icon: "TicketPlus" }
    ])}
    <section class="grid grid-2">
      ${analyticsFunnelPanel(summary)}
      ${analyticsPagesPanel(summary.pages)}
    </section>
    <div class="section-head"><h2>Widget performance</h2><span class="muted">Views, kliks en commerce-acties per widget.</span></div>
    <div class="panel">${analyticsWidgetTable(summary.widgets)}</div>
    <div class="section-head"><h2>Meest gemeten acties</h2><span class="muted">Laatste 14 dagen, gegroepeerd per widget.</span></div>
    <div class="panel">${analyticsActionsTable(summary.actions)}</div>
  `));
});

adminRouter.get("/groei/events.csv", (_req, res) => {
  const rows = db.prepare(`
    SELECT created_at, widget, action, target, value, page_url, referrer, shop_origin
    FROM analytics_events
    ORDER BY created_at DESC
    LIMIT 1000
  `).all();
  const header = ["aangemaakt", "widget", "actie", "target", "waarde", "pagina", "referrer", "shop_origin"];
  const body = rows.map((row) => [
    row.created_at,
    row.widget,
    analyticsActionLabel(row.action),
    row.target,
    row.value,
    row.page_url,
    row.referrer,
    row.shop_origin
  ].map(csv).join(","));
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", "attachment; filename=\"mff-widget-events.csv\"");
  return res.send([header.map(csv).join(","), ...body].join("\n"));
});

adminRouter.get("/menu", (_req, res) => {
  const groups = [
    ["Beheer", [
      ["Groei", "/admin/groei", "LineChart", "Conversie, widgetperformance en live readiness."],
      ["Winnaars", "/admin/winnaars", "Trophy", "Getrokken winnaars en social-proof publicatie."],
      ["Loten", "/admin/loten", "Tickets", "Alle deelnamebewijzen en bronnen."],
      ["Orders", "/admin/orders", "ShoppingCart", "Orderwaarde en lottoekenning."],
      ["Producten", "/admin/producten", "Beef", "Shopify producten, prijzen en kaart-tags."],
      ["Deelnemers", "/admin/deelnemers", "Users", "Klanten, winnaars en deelnamewaarde."]
    ]],
    ["Controle", [
      ["Compliance", "/admin/compliance", "ShieldCheck", "Gratis deelname, IP-hashes en audit."],
      ["Teamhub", "/admin/teamhub", "MessagesSquare", "Profielen en KPI-discussies."],
      ["Accounts", "/admin/accounts", "UserCog", "Admin gebruikers, rollen en sessies."],
      ["Synchronisatie", "/admin/sync", "RefreshCw", "Orders en klantdashboards bijwerken."],
      ["Regels", "/admin/regels", "SlidersHorizontal", "Lottoekenning en gratis deelname."],
      ["Site structuur", "/admin/site-structuur", "LayoutTemplate", "Homepage, header, PDP en infopagina's."],
      ["Widgets", "/admin/widgets", "PanelTop", "Teksten en knoppen per widget."]
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

adminRouter.get("/teamhub", (req, res) => {
  const canManage = hasAdminPermission(req.adminUser, "manage_teamhub");
  const users = listAdminUsers();
  const threads = listKpiThreads({ limit: 60 });
  const selectedThreadId = textParam(req.query.thread) || threads[0]?.id || "";
  const selectedThread = selectedThreadId ? getKpiThread(selectedThreadId) : null;
  const messages = selectedThread ? listKpiMessages(selectedThread.id) : [];
  const metrics = getMetrics();
  const discussions = kpiDiscussionSummary();
  const productStatus = productSyncStatus();
  res.send(page("Teamhub | Meat For Free", "teamhub", `
    ${topbar("Controlecentrum", "Teamhub en KPI-overleg.", "Profielen, verantwoordelijkheden en KPI-beslissingen op één plek. Alleen actiegerichte discussies, geen losse chatruis.", `<a class="button button--ghost" href="/admin/accounts">${icon("UserCog")}Account instellingen</a>`)}
    ${kpiGrid([
      { label: "Open KPI-discussies", value: discussions.openCount, help: `${discussions.hotCount} hoge prioriteit.`, icon: "MessagesSquare" },
      { label: "Live loten", value: metrics.activeLiveEntries, help: "Actieve loten in live winacties.", icon: "Tickets" },
      { label: "Missende loten", value: metrics.eligibleWithoutEntry, help: "Geschikte orders zonder lot.", icon: "TriangleAlert" },
      { label: "Product sync", value: productStatus.available, help: productStatus.lastSyncedAt ? `Laatste sync ${formatShortDate(productStatus.lastSyncedAt)}.` : "Nog geen sync.", icon: "Beef" }
    ], "hub-kpi-grid")}
    <div class="section-head"><h2>Teamprofielen</h2><span class="muted">Wie pakt welke signalen op?</span></div>
    ${teamCards(users)}
    <div class="section-head"><h2>KPI-discussies</h2><span class="muted">Beslissingen per metric, auditbaar en terugleesbaar.</span></div>
    <section class="hub-layout">
      <div class="stack">
        ${canManage ? `<section class="panel panel-pad">
          <div class="panel-title"><div><h2>Nieuwe discussie</h2><p class="helper">Start alleen een thread als er een beslissing, blokkade of duidelijke actie nodig is.</p></div></div>
          <form method="post" action="/admin/teamhub/threads" class="thread-create">
            <label>Titel<input name="title" placeholder="Bijv. Orders zonder lot onderzoeken" required></label>
            <div class="form-grid">
              <label>KPI<select name="kpiKey">${kpiOptions()}</select></label>
              <label>Prioriteit<select name="priority">${option("NORMAL", "", "Normaal")}${option("HIGH", "", "Hoog")}${option("URGENT", "", "Urgent")}${option("LOW", "", "Laag")}</select></label>
            </div>
            <label>Eerste bericht<textarea name="body" placeholder="Wat zien we, waarom maakt het uit, en wat moet beslist worden?" required></textarea></label>
            <div class="actions" style="justify-content:flex-start"><button class="button--gold" type="submit">${icon("MessageSquarePlus")}Discussie starten</button></div>
          </form>
        </section>` : ""}
        <section class="panel panel-pad">
          <div class="panel-title"><div><h2>Actieve threads</h2><p class="helper">${threads.length} discussie(s), nieuwste activiteit bovenaan.</p></div></div>
          ${threadCards(threads, selectedThread?.id || "")}
        </section>
      </div>
      ${threadPanel(selectedThread, messages, users, canManage)}
    </section>
  `));
});

adminRouter.post("/teamhub/threads", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_teamhub");
    const thread = createKpiThread({
      title: req.body.title,
      kpiKey: req.body.kpiKey,
      priority: req.body.priority,
      body: req.body.body,
      createdBy: req.adminUser?.id || ""
    });
    writeAuditLog({
      actor: actor(req),
      action: "KPI_THREAD_CREATED",
      targetType: "admin_kpi_thread",
      targetId: thread.id,
      message: `KPI-discussie aangemaakt: ${thread.title}.`,
      metadata: { kpiKey: thread.kpi_key, priority: thread.priority }
    });
    res.redirect(`/admin/teamhub?thread=${encodeURIComponent(thread.id)}`);
  } catch (error) {
    res.status(400).send(page("Teamhub fout | Meat For Free", "teamhub", topbar("Niet opgeslagen", "KPI-discussie kon niet worden aangemaakt.", error.message, `<a class="button button--gold" href="/admin/teamhub">Terug</a>`)));
  }
});

adminRouter.post("/teamhub/threads/:threadId/messages", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_teamhub");
    createKpiMessage({
      threadId: req.params.threadId,
      userId: req.adminUser?.id || "",
      body: req.body.body
    });
    writeAuditLog({
      actor: actor(req),
      action: "KPI_THREAD_MESSAGE_CREATED",
      targetType: "admin_kpi_thread",
      targetId: req.params.threadId,
      message: "Bericht toegevoegd aan KPI-discussie."
    });
    res.redirect(`/admin/teamhub?thread=${encodeURIComponent(req.params.threadId)}`);
  } catch (error) {
    res.status(400).send(page("Teamhub fout | Meat For Free", "teamhub", topbar("Niet opgeslagen", "Bericht kon niet worden geplaatst.", error.message, `<a class="button button--gold" href="/admin/teamhub">Terug</a>`)));
  }
});

adminRouter.post("/teamhub/threads/:threadId/status", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_teamhub");
    const thread = updateKpiThread({
      threadId: req.params.threadId,
      status: req.body.status,
      priority: req.body.priority,
      assignedTo: req.body.assignedTo
    });
    writeAuditLog({
      actor: actor(req),
      action: "KPI_THREAD_UPDATED",
      targetType: "admin_kpi_thread",
      targetId: thread.id,
      message: `KPI-discussie bijgewerkt: ${thread.title}.`,
      metadata: { status: thread.status, priority: thread.priority, assignedTo: thread.assigned_to || "" }
    });
    res.redirect(`/admin/teamhub?thread=${encodeURIComponent(thread.id)}`);
  } catch (error) {
    res.status(400).send(page("Teamhub fout | Meat For Free", "teamhub", topbar("Niet opgeslagen", "Status kon niet worden bijgewerkt.", error.message, `<a class="button button--gold" href="/admin/teamhub">Terug</a>`)));
  }
});

adminRouter.get("/accounts", (req, res) => {
  const currentUser = req.adminUser || null;
  const canManage = hasAdminPermission(currentUser, "manage_accounts");
  const canViewAudit = hasAdminPermission(currentUser, "view_audit");
  const users = canManage ? listAdminUsers() : [currentUser].filter(Boolean);
  const sessions = canManage ? listAdminSessions() : listAdminSessions().filter((session) => session.userId === currentUser?.id);
  const invites = canManage ? listAdminInvites() : [];
  const resets = canManage ? listAdminPasswordResets() : [];
  const reason = textParam(req.query.reason);
  const auditAction = textParam(req.query.action);
  const auditActor = textParam(req.query.actor);
  const logs = canViewAudit ? filteredAuditRows({ action: auditAction, actorName: auditActor }) : [];
  res.send(page("Accounts | Meat For Free", "accounts", `
    ${topbar("Security", "Team access control.", "Accounts, rollen, permissies, uitnodigingen, resetlinks, sessies en audit in één schaalbaar model.", `<form method="post" action="/admin/logout" class="inline-form"><button class="button--ghost" type="submit">${icon("LogOut")}Uitloggen</button></form>`)}
    ${reason === "password" ? `<section class="panel panel-pad" style="margin-bottom:16px"><div class="ops-item"><span class="ops-icon">${icon("KeyRound")}</span><span><strong>Wachtwoord wijzigen vereist</strong><br><span class="muted">Wijzig je tijdelijke of recovery wachtwoord voordat je verder werkt.</span></span><span class="status status--actie">Actie</span></div></section>` : ""}
    <section class="grid grid-3">
      <div class="card card--tint-0"><div class="card-head"><strong>Teamleden</strong><span class="card-icon">${icon("Users")}</span></div><div class="stat">${users.length}</div><p>Persoonlijke accounts met permissies.</p></div>
      <div class="card card--tint-1"><div class="card-head"><strong>Actieve sessies</strong><span class="card-icon">${icon("MonitorCheck")}</span></div><div class="stat">${sessions.filter((session) => !session.revokedAt).length}</div><p>Browser sessies die nog geldig zijn.</p></div>
      <div class="card card--tint-2"><div class="card-head"><strong>Open invites</strong><span class="card-icon">${icon("MailPlus")}</span></div><div class="stat">${invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date().toISOString()).length}</div><p>Setup-links die nog bruikbaar zijn.</p></div>
    </section>
    <section class="grid grid-2">
      ${currentUserPanel(currentUser, reason)}
      ${createAccountPanel(canManage)}
    </section>
    <div class="section-head"><h2>Gebruikers</h2><span class="muted">${canManage ? "Beheer rollen, status en resets." : "Alleen eigenaren kunnen accounts aanpassen."}</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Gebruiker</th><th>Status</th><th>Rol</th><th>Laatste login</th><th>Policy</th><th>Profiel</th><th>Reset</th></tr></thead>
        <tbody>${accountRows(users, currentUser, canManage)}</tbody>
      </table>
    </div>
    ${canManage ? `<div class="section-head"><h2>Uitnodigingen</h2><span class="muted">Setup-links zijn bewust maar één keer zichtbaar bij aanmaken.</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Uitnodiging</th><th>Status</th><th>Rol</th><th>Permissies</th><th>Verloopt</th><th>Actie</th></tr></thead>
        <tbody>${inviteRows(invites)}</tbody>
      </table>
    </div>
    <div class="section-head"><h2>Resetlinks</h2><span class="muted">Korte geldigheid, sessies worden ingetrokken na gebruik.</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Account</th><th>Status</th><th>Verloopt</th><th>Aangemaakt</th><th>Info</th></tr></thead>
        <tbody>${resetRows(resets)}</tbody>
      </table>
    </div>` : ""}
    <div class="section-head"><h2>Sessies</h2><span class="muted">Trek sessies in bij twijfel of rolwijzigingen.</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Account</th><th>Status</th><th>Laatst gezien</th><th>IP</th><th>Browser</th><th>Actie</th></tr></thead>
        <tbody>${sessionRows(sessions, req.adminSession?.id || "", canManage)}</tbody>
      </table>
    </div>
    ${canViewAudit ? `<div class="section-head"><h2>Security audit</h2><span class="muted">Zoekbaar bewijs van beheeracties.</span></div>
    <section class="filters">
      <form method="get" action="/admin/accounts" class="filter-grid">
        <label>Actie<input name="action" value="${escapeHtml(auditAction)}" placeholder="ADMIN_..."></label>
        <label>Actor<input name="actor" value="${escapeHtml(auditActor)}" placeholder="gebruikersnaam"></label>
        <div class="actions"><button type="submit">${icon("Search")}Zoeken</button><a class="button button--ghost" href="/admin/accounts">Reset</a></div>
      </form>
    </section>
    <div class="panel">
      <table>
        <thead><tr><th>Tijd</th><th>Actie</th><th>Doel</th><th>Bericht</th><th>Metadata</th></tr></thead>
        <tbody>${auditSecurityRows(logs)}</tbody>
      </table>
    </div>` : ""}
  `));
});

adminRouter.post("/account/profile", urlencoded, (req, res) => {
  try {
    if (!req.adminUser?.id || req.adminUser.id === "legacy") throw new Error("Log opnieuw in om je profiel te beheren.");
    const user = updateOwnAdminProfile(req.adminUser.id, {
      email: req.body.email,
      name: req.body.name,
      title: req.body.title,
      avatarUrl: req.body.avatarUrl,
      phone: req.body.phone,
      bio: req.body.bio,
      focusArea: req.body.focusArea,
      availabilityStatus: req.body.availabilityStatus
    });
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_PROFILE_UPDATED",
      targetType: "admin_user",
      targetId: user.id,
      message: "Admin profiel bijgewerkt.",
      metadata: { availabilityStatus: user.availabilityStatus, focusArea: user.focusArea }
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Profiel fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Profiel kon niet worden bijgewerkt.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/account/password", urlencoded, (req, res) => {
  try {
    if (!req.adminUser?.id || req.adminUser.id === "legacy") throw new Error("Log opnieuw in om je wachtwoord te wijzigen.");
    const nextPassword = textParam(req.body.newPassword);
    if (nextPassword !== textParam(req.body.confirmPassword)) throw new Error("Nieuwe wachtwoorden zijn niet gelijk.");
    changeOwnAdminPassword(req.adminUser.id, String(req.body.currentPassword || ""), nextPassword, req.adminSession?.id || "");
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_PASSWORD_CHANGED",
      targetType: "admin_user",
      targetId: req.adminUser.id,
      message: "Admin wijzigde eigen wachtwoord."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Wachtwoord niet gewijzigd.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/account/2fa/start", urlencoded, (req, res) => {
  try {
    if (!req.adminUser?.id || req.adminUser.id === "legacy") throw new Error("Log opnieuw in om 2FA te beheren.");
    startAdminTotpSetup(req.adminUser.id);
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_2FA_SETUP_STARTED",
      targetType: "admin_user",
      targetId: req.adminUser.id,
      message: "Admin startte 2FA setup."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("2FA fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "2FA setup kon niet starten.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/account/2fa/confirm", urlencoded, (req, res) => {
  try {
    if (!req.adminUser?.id || req.adminUser.id === "legacy") throw new Error("Log opnieuw in om 2FA te beheren.");
    confirmAdminTotpSetup(req.adminUser.id, req.body.totp);
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_2FA_ENABLED",
      targetType: "admin_user",
      targetId: req.adminUser.id,
      message: "Admin heeft 2FA ingeschakeld."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("2FA fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "2FA kon niet worden bevestigd.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/account/2fa/disable", urlencoded, (req, res) => {
  try {
    if (!req.adminUser?.id || req.adminUser.id === "legacy") throw new Error("Log opnieuw in om 2FA te beheren.");
    disableAdminTotp(req.adminUser.id);
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_2FA_DISABLED",
      targetType: "admin_user",
      targetId: req.adminUser.id,
      message: "Admin heeft 2FA uitgeschakeld."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("2FA fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "2FA kon niet worden uitgezet.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

function accessLinkPage(title, copy, link, { email = "", subject = "Meat For Free account toegang" } = {}) {
  const mailBody = `Hi,\n\nGebruik deze eenmalige Meat For Free beheerlink:\n${link}\n\nOpen de link alleen zelf en stuur hem niet door.`;
  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`
    : "";
  return page(`${title} | Meat For Free`, "accounts", `
    ${topbar("Security link", title, copy, `<a class="button button--gold" href="/admin/accounts">${icon("UserCog")}Terug naar accounts</a>`)}
    <section class="panel panel-pad">
      <div class="panel-title"><div><h2>Eenmalige link</h2><p class="helper">De link wordt om veiligheidsredenen alleen nu getoond. Maak opnieuw aan als hij kwijt is.</p></div></div>
      <code class="code-line">${escapeHtml(link)}</code>
      <div class="actions" style="margin-top:16px">
        ${mailto ? `<a class="button button--gold" href="${escapeHtml(mailto)}">${icon("Mail")}Mail klaarzetten</a>` : ""}
        <a class="button button--ghost" href="/admin/accounts">${icon("ShieldCheck")}Status bekijken</a>
      </div>
    </section>
  `);
}

adminRouter.post("/accounts/invites", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    const invite = createAdminInvite({
      email: req.body.email,
      name: req.body.name,
      role: req.body.role,
      permissions: permissionValues(req.body.permissions),
      invitedBy: req.adminUser?.id || "",
      expiresInHours: Number(req.body.expiresInHours || 72)
    });
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_INVITE_CREATED",
      targetType: "admin_invite",
      targetId: invite.id,
      message: `Admin uitnodiging gemaakt voor ${invite.email}.`,
      metadata: { role: invite.role, permissions: invite.permissions }
    });
    const link = `${req.protocol}://${req.get("host")}${invite.setupPath}`;
    res.send(accessLinkPage("Uitnodiging aangemaakt.", "Stuur deze setup-link alleen naar de juiste persoon.", link, {
      email: invite.email,
      subject: "Je Meat For Free admin uitnodiging"
    }));
  } catch (error) {
    res.status(400).send(page("Invite fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Uitnodiging kon niet worden aangemaakt.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/invites/:inviteId/revoke", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    revokeAdminInvite(req.params.inviteId);
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_INVITE_REVOKED",
      targetType: "admin_invite",
      targetId: req.params.inviteId,
      message: "Admin uitnodiging ingetrokken."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Invite fout | Meat For Free", "accounts", topbar("Actie gestopt", "Uitnodiging kon niet worden ingetrokken.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    const user = createAdminUser({
      username: req.body.username,
      email: req.body.email,
      name: req.body.name,
      title: req.body.title,
      password: req.body.password,
      role: req.body.role,
      permissions: permissionValues(req.body.permissions),
      forcePasswordChange: req.body.forcePasswordChange === "1"
    });
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_ACCOUNT_CREATED",
      targetType: "admin_user",
      targetId: user.id,
      message: `Admin account ${user.username} aangemaakt.`,
      metadata: { role: user.role }
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Account kon niet worden aangemaakt.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/:userId/update", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    const user = updateAdminUser(req.params.userId, {
      email: req.body.email,
      name: req.body.name,
      title: req.body.title,
      role: req.body.role,
      status: req.body.status,
      permissions: permissionValues(req.body.permissions),
      forcePasswordChange: req.body.forcePasswordChange === "1"
    });
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_ACCOUNT_UPDATED",
      targetType: "admin_user",
      targetId: user.id,
      message: `Admin account ${user.username} bijgewerkt.`,
      metadata: { role: user.role, status: user.status }
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Account kon niet worden bijgewerkt.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/:userId/password", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    const user = getAdminUser(req.params.userId);
    if (!user) throw new Error("Admin gebruiker niet gevonden.");
    setAdminUserPassword(user.id, req.body.password, {
      forcePasswordChange: req.body.forcePasswordChange === "1",
      revokeSessions: true,
      exceptSessionId: user.id === req.adminUser?.id ? req.adminSession?.id || "" : ""
    });
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_ACCOUNT_PASSWORD_RESET",
      targetType: "admin_user",
      targetId: user.id,
      message: `Wachtwoordreset voor admin account ${user.username}.`
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Wachtwoord kon niet worden gereset.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/:userId/reset-link", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    const reset = createAdminPasswordReset(req.params.userId, req.adminUser?.id || "");
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_PASSWORD_RESET_LINK_CREATED",
      targetType: "admin_user",
      targetId: req.params.userId,
      message: "Admin wachtwoord resetlink aangemaakt."
    });
    const link = `${req.protocol}://${req.get("host")}${reset.resetPath}`;
    res.send(accessLinkPage("Resetlink aangemaakt.", "Stuur deze link alleen naar de eigenaar van het account.", link, {
      email: reset.email || "",
      subject: "Je Meat For Free admin resetlink"
    }));
  } catch (error) {
    res.status(400).send(page("Reset fout | Meat For Free", "accounts", topbar("Niet opgeslagen", "Resetlink kon niet worden aangemaakt.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/:userId/revoke-sessions", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    revokeAdminUserSessions(req.params.userId, req.params.userId === req.adminUser?.id ? req.adminSession?.id || "" : "");
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_ACCOUNT_SESSIONS_REVOKED",
      targetType: "admin_user",
      targetId: req.params.userId,
      message: "Admin sessies ingetrokken."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Actie gestopt", "Sessies konden niet worden ingetrokken.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.post("/accounts/sessions/:sessionId/revoke", urlencoded, (req, res) => {
  try {
    requirePermission(req, "manage_accounts");
    revokeAdminSession(req.params.sessionId);
    writeAuditLog({
      actor: actor(req),
      action: "ADMIN_SESSION_REVOKED",
      targetType: "admin_session",
      targetId: req.params.sessionId,
      message: "Admin sessie ingetrokken."
    });
    res.redirect("/admin/accounts");
  } catch (error) {
    res.status(400).send(page("Account fout | Meat For Free", "accounts", topbar("Actie gestopt", "Sessie kon niet worden ingetrokken.", error.message, `<a class="button button--gold" href="/admin/accounts">Terug</a>`)));
  }
});

adminRouter.get("/winnaars", (_req, res) => {
  const rows = winnerAdminRows(60);
  const settings = getWidgetSettings("winners");
  const publication = winnerPublicationState(settings, rows);
  const drawnCount = rows.length;
  const publicRows = publication.publicRows || rows.filter((row) => row.winner_public_status === "PUBLIC" && row.winner_consent_status === "APPROVED" && textParam(row.winner_public_name) && textParam(row.winner_public_statement));
  const lastWinner = rows[0] || null;
  const manualCards = publication.manualCards;
  const visibleCount = publication.source === "manual" ? manualCards.length : publicRows.length;
  const sourceLabelText = publication.source === "manual" ? "Handmatig" : "Automatisch";

  res.send(page("Winnaars | Meat For Free", "winnaars", `
    ${topbar("Winnaars", "Beheer publicatie van winnaars.", "Controleer getrokken winnaars en bepaal of de widget automatische data of handmatig goedgekeurde kaarten gebruikt.", `<a class="button button--gold" href="/admin/widgets#widget-winners">${icon("PanelTop")}Widget aanpassen</a><a class="button button--ghost" href="/admin/winacties?winnerState=yes">${icon("Gift")}Afgeronde winacties</a>`)}
    <div class="section-head"><h2>Publicatie beheren</h2><span class="status">${publicRows.length} publiek</span></div>
    <section class="panel panel-pad">${winnerPublicationCards(rows)}</section>
    ${kpiGrid([
      { label: "Getrokken winnaars", value: drawnCount, help: "Alle afgeronde acties met winnaar.", icon: "Trophy" },
      { label: "Widget bron", value: sourceLabelText, help: publication.note, icon: publication.source === "manual" ? "PencilLine" : "RefreshCw" },
      { label: "Publiceerbaar", value: visibleCount, help: publication.source === "manual" ? "Handmatige kaarten met inhoud." : "Consent goedgekeurd met publieke naam en statement.", icon: "BadgeCheck" },
      { label: "Laatste winnaar", value: lastWinner ? winnerPublicName(lastWinner) : "-", help: lastWinner ? lastWinner.draw_title : "Nog geen trekking afgerond.", icon: "UserCheck" }
    ])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Publicatie</p><h2>Widget status</h2></div>${statusBadge(publication.status)}</div>
        <div class="stack">
          <div class="ops-item"><span class="ops-icon">${icon(publication.source === "manual" ? "PencilLine" : "RefreshCw")}</span><span><strong>${escapeHtml(sourceLabelText)} als bron</strong><br><span class="muted">${escapeHtml(publication.note)}</span></span><span class="status">${escapeHtml(sourceLabelText)}</span></div>
          <a class="ops-item" href="/admin/widgets#widget-winners" style="text-decoration:none"><span class="ops-icon">${icon("ImagePlus")}</span><span><strong>Naam, statement en foto beheren</strong><br><span class="muted">Upload alleen goedgekeurde beelden en zet handmatig pas aan wanneer de kaarten compleet zijn.</span></span><span class="status">Open</span></a>
          <a class="ops-item" href="/admin/compliance" style="text-decoration:none"><span class="ops-icon">${icon("ShieldCheck")}</span><span><strong>Privacy check</strong><br><span class="muted">Publieke winnaars tonen alleen beperkte data. Volledige klantdata blijft in admin.</span></span><span class="status">Controle</span></a>
        </div>
      </div>
      ${manualWinnerCardsPanel(manualCards)}
    </section>
    <div class="section-head"><h2>Getrokken winnaars</h2><a class="button button--ghost" href="/admin/winacties?winnerState=yes">${icon("Filter")}Filter winacties</a></div>
    <div class="panel">${rows.length ? winnerRowsTable(rows) : `<div class="empty">Nog geen getrokken winnaars. Zodra een live winactie is getrokken, verschijnt de winnaar hier.</div>`}</div>
    ${winnerPublicationUploadScript()}
  `));
});

adminRouter.post("/winnaars/:drawId/publication", urlencoded, (req, res) => {
  try {
    const draw = db.prepare(`
      SELECT d.*, e.entry_number
      FROM lottery_draws d
      LEFT JOIN lottery_entries e ON e.id = d.winner_entry_id
      WHERE d.id = ?
    `).get(req.params.drawId);
    if (!draw || !draw.winner_entry_id) throw new Error("Winnaar niet gevonden.");

    const contactStatuses = ["NOT_CONTACTED", "CONTACTED", "REPLIED"];
    const consentStatuses = ["UNKNOWN", "REQUESTED", "APPROVED", "DECLINED"];
    const contactInput = textParam(req.body.contactStatus);
    const consentInput = textParam(req.body.consentStatus);
    const contactStatus = contactStatuses.includes(contactInput) ? contactInput : "NOT_CONTACTED";
    const consentStatus = consentStatuses.includes(consentInput) ? consentInput : "UNKNOWN";
    const consentReference = textParam(req.body.consentReference).slice(0, 220);
    const internalNote = textParam(req.body.internalNote).slice(0, 520);
    const publicStatus = textParam(req.body.publicStatus) === "PUBLIC" ? "PUBLIC" : "PRIVATE";
    const publicName = textParam(req.body.publicName).slice(0, 80);
    const publicStatement = textParam(req.body.publicStatement).slice(0, 220);
    const publicImageUrl = textParam(req.body.publicImageUrl).slice(0, 520);
    if (publicStatus === "PUBLIC" && consentStatus !== "APPROVED") {
      throw new Error("Consent moet goedgekeurd zijn voordat je deze winnaar publiek toont.");
    }
    if (publicStatus === "PUBLIC" && (!publicName || !publicStatement)) {
      throw new Error("Vul een publieke naam en echt statement in voordat je deze winnaar publiceert.");
    }

    const approvedAt = publicStatus === "PUBLIC" ? (draw.winner_public_approved_at || nowIso()) : null;
    db.prepare(`
      UPDATE lottery_draws
      SET winner_public_status = ?,
          winner_public_name = ?,
          winner_public_statement = ?,
          winner_public_image_url = ?,
          winner_public_approved_at = ?,
          winner_contact_status = ?,
          winner_consent_status = ?,
          winner_consent_reference = ?,
          winner_internal_note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(publicStatus, publicName, publicStatement, publicImageUrl, approvedAt, contactStatus, consentStatus, consentReference, internalNote, nowIso(), draw.id);
    writeAuditLog({
      actor: actor(req),
      action: "WINNAAR_PUBLICATIE_BIJGEWERKT",
      targetType: "lottery_draw",
      targetId: draw.id,
      message: `${draw.entry_number || "Winnaar"} publicatie: ${statusLabel(publicStatus)}`,
      metadata: {
        publicStatus,
        contactStatus,
        consentStatus,
        hasConsentReference: Boolean(consentReference),
        hasInternalNote: Boolean(internalNote),
        hasStatement: Boolean(publicStatement),
        hasImage: Boolean(publicImageUrl)
      }
    });
    res.redirect("/admin/winnaars");
  } catch (error) {
    res.status(400).send(page("Winnaar fout | Meat For Free", "winnaars", topbar("Niet opgeslagen", "Winnaar kon niet worden bijgewerkt.", error.message, `<a class="button button--gold" href="/admin/winnaars">Terug</a>`)));
  }
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
  const checklist = drawChecklist(draw, counts);
  const statusActions = [
    ["DRAFT", "Terug naar concept", "Pauzeer publieke actie om inhoud te corrigeren.", "FilePenLine"],
    ["LIVE", "Publiceren", checklist.ready ? "Maak deze winactie actief voor nieuwe loten." : "Checklist moet eerst groen zijn.", "Rocket"],
    ["ARCHIVED", "Archiveren", "Haal oude acties uit operationele focus.", "Archive"]
  ].filter(([status]) => status !== draw.status);

  const exportAction = hasAdminPermission(req.adminUser, "view_entries")
    ? `<a class="button button--ghost" href="/admin/draws/${escapeHtml(draw.id)}/export.csv">Export CSV</a>`
    : "";
  res.send(page(`${draw.title} | Meat For Free`, "winacties", `
    ${topbar("Winactie bewerken", draw.title, "Pas inhoud, prijs, timing en status aan.", `<a class="button button--ghost" href="/admin/winacties">Terug</a>${exportAction}`)}
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
        <div class="panel-title"><div><p class="eyebrow">Publicatie</p><h2>Checklist en status</h2></div><span class="status status--${checklist.ready ? "goed" : "controle"}">${checklist.ready ? "Klaar" : "Check"}</span></div>
        <div class="stack">
          ${checklist.checks.map(([label, ok, help]) => `<div class="ops-item"><span class="ops-icon">${icon(ok ? "Check" : "CircleAlert")}</span><span><strong>${escapeHtml(label)}</strong><br><span class="muted">${escapeHtml(help)}</span></span><span class="status status--${ok ? "goed" : "controle"}">${ok ? "Goed" : "Check"}</span></div>`).join("")}
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:14px">
          ${statusActions.map(([status, label, help, iconName]) => `<form class="inline-form" method="post" action="/admin/winacties/${escapeHtml(draw.id)}/status"><input type="hidden" name="status" value="${escapeHtml(status)}"><button class="${status === "LIVE" ? "button--gold" : ""}" type="submit" title="${escapeHtml(help)}"${status === "LIVE" && !checklist.ready ? " disabled" : ""}>${icon(iconName)}${escapeHtml(label)}</button></form>`).join("")}
        </div>
      </div>
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
    status: normalizeDrawStatusInput(req.body.status)
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
  const status = normalizeDrawStatusInput(req.body.status, draw);
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

adminRouter.post("/winacties/:id/status", urlencoded, (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send("Winactie niet gevonden");
  const counts = db.prepare("SELECT status, COUNT(*) AS count FROM lottery_entries WHERE draw_id = ? GROUP BY status").all(draw.id);
  const checklist = drawChecklist(draw, counts);
  const status = normalizeDrawStatusInput(req.body.status, draw);
  if (status === "LIVE" && !checklist.ready) {
    return res.status(400).send(page("Publicatie gestopt", "winacties", topbar("Nog niet klaar", "Deze winactie mist nog checklistpunten.", "Vul prijs, tekst, planning en loten aan voordat je live zet.", `<a class="button button--gold" href="/admin/winacties/${escapeHtml(draw.id)}">Terug</a>`)));
  }
  db.prepare("UPDATE lottery_draws SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), draw.id);
  writeAuditLog({
    actor: actor(req),
    action: "WINACTIE_STATUS_AANGEPAST",
    targetType: "lottery_draw",
    targetId: draw.id,
    message: `${statusLabel(draw.status)} naar ${statusLabel(status)}`,
    metadata: { previousStatus: draw.status, newStatus: status }
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

adminRouter.get("/producten", (req, res) => {
  const filter = productFilter(req);
  const products = listSyncedProducts({ ...filter, limit: 120 });
  const syncStatus = productSyncStatus();
  const salesSummary = productSalesSummary();
  const productSalesLookup = productSalesRows(100);
  const topSalesRows = productSalesLookup.slice(0, 8);
  const salesByProductId = new Map(productSalesLookup.map((row) => [String(row.shopify_product_id || ""), row]));
  const salesForProduct = (product) => salesByProductId.get(String(product.shopify_product_id || "")) || {
    quantity_sold: 0,
    order_count: 0,
    revenue_cents: 0,
    last_order_at: ""
  };
  const statusTags = db.prepare(`
    SELECT status_tag, COUNT(*) AS count
    FROM shopify_products
    WHERE status_tag IS NOT NULL AND status_tag != ''
    GROUP BY status_tag
    ORDER BY count DESC, status_tag ASC
  `).all();
  const availableCount = products.filter((product) => Number(product.available || 0) === 1).length;
  const dealCount = products.filter((product) => product.status_tag === "Deal").length;
  const staleLabel = syncStatus.stale ? "Sync nodig" : "Actueel";
  const productImage = (product) => product.image_url
    ? `<span class="product-thumb"><img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}" loading="lazy"></span>`
    : `<span class="product-thumb product-thumb--empty">${icon("Image")}</span>`;
  const productMetric = (label, value) => `<span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;

  res.send(page("Producten | Meat For Free", "producten", `
    ${topbar("Producten", "Shopify data voor productkaarten.", "Gebruik deze pagina om homepage productkaarten echt te houden: actuele prijzen, afbeeldingen, voorraadstatus en status-tags.", `<form class="inline-form" method="post" action="/admin/sync-products"><button class="button--gold" type="submit">${icon("RefreshCw")}Producten syncen</button></form><a class="button button--ghost" href="/admin/widgets">${icon("PanelTop")}Product widget</a>`)}
    ${kpiGrid([
      { label: "Gecachet", value: syncStatus.total, help: "Aantal Shopify producten in de lokale cache.", icon: "Beef" },
      { label: "Productomzet", value: formatEuro(salesSummary.revenueCents), help: `${salesSummary.quantitySold} verkochte stuks in opgeslagen orders.`, icon: "TrendingUp" },
      { label: "Orders met regels", value: salesSummary.orderCount, help: `${salesSummary.productCount} unieke producten gezien.`, icon: "ReceiptText" },
      { label: "Laatste sync", value: staleLabel, help: syncStatus.lastSyncedAt || "Nog niet gesynchroniseerd.", icon: "RefreshCw" }
    ])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><h2>Sync gezondheid</h2><p class="helper">Deze data voedt de productkaarten op de storefront zodra de widget op Shopify-sync staat.</p></div></div>
      <div class="sync-health">
        <div class="sync-health-item"><span class="muted">Beschikbaar in selectie</span><strong>${availableCount}</strong></div>
        <div class="sync-health-item"><span class="muted">Deals in selectie</span><strong>${dealCount}</strong></div>
        <div class="sync-health-item"><span class="muted">Laatste sync</span><strong>${escapeHtml(syncStatus.lastSyncedAt ? syncStatus.lastSyncedAt.slice(0, 16).replace("T", " ") : "Nooit")}</strong></div>
      </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><div><h2>Best verkopend uit orders</h2><p class="helper">Gebaseerd op Shopify line-items die via webhooks binnenkomen.</p></div></div>
        <div class="stack">
          ${topSalesRows.length ? topSalesRows.slice(0, 4).map((row) => `<div class="ops-item"><span class="ops-icon">${icon("Beef")}</span><span><strong>${escapeHtml(row.title)}</strong><br><span class="muted">${row.quantity_sold || 0} stuks · ${row.order_count || 0} orders · ${formatEuro(row.revenue_cents || 0)}</span></span><span class="status">${escapeHtml(row.status_tag || "Data")}</span></div>`).join("") : `<div class="empty">Nog geen orderregels opgeslagen. Nieuwe Shopify orders vullen dit automatisch.</div>`}
        </div>
      </div>
    </section>
    <section class="filters">
      <form method="get" action="/admin/producten" class="filter-grid">
        <label class="wide">Zoek product<input name="q" value="${escapeHtml(filter.q)}" placeholder="Ribeye, BBQ, handle of tag"></label>
        <label>Status-tag<select name="statusTag">${option("", filter.statusTag, "Alle tags")}${statusTags.map((row) => option(row.status_tag, filter.statusTag, `${row.status_tag} (${row.count})`)).join("")}</select></label>
        <label>Beschikbaar<select name="available">${option("", filter.available, "Alles")}${option("yes", filter.available, "Alleen beschikbaar")}${option("no", filter.available, "Niet beschikbaar")}</select></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/producten">Reset</a></div>
      </form>
    </section>
    <div class="panel">
      <table>
        <thead><tr><th>Product</th><th>Prijs</th><th>Status-tag</th><th>Verkoop</th><th>Voorraad</th><th>Sync</th></tr></thead>
        <tbody>${products.length ? products.map((product) => {
          const sales = salesForProduct(product);
          return `<tr>
          <td>
            <div class="product-cell">
              ${productImage(product)}
              <span><strong>${escapeHtml(product.title)}</strong><span class="muted">${escapeHtml(product.handle)}${product.product_type ? ` · ${escapeHtml(product.product_type)}` : ""}</span></span>
            </div>
          </td>
          <td><strong>${formatEuro(product.price_cents || 0)}</strong>${Number(product.compare_at_cents || 0) > Number(product.price_cents || 0) ? `<span class="muted">Was ${formatEuro(product.compare_at_cents || 0)}</span>` : ""}</td>
          <td>${product.status_tag ? statusBadge(product.status_tag) : `<span class="muted">Geen badge</span>`}</td>
          <td>${productMetric("Omzet", formatEuro(sales.revenue_cents || 0))}<span class="muted">${sales.quantity_sold || 0} stuks · ${sales.order_count || 0} orders</span></td>
          <td>${Number(product.available || 0) === 1 ? statusBadge("ACTIVE") : statusBadge("Controle")}<br><span class="muted">${product.inventory_quantity == null ? "Voorraad onbekend" : `${product.inventory_quantity} beschikbaar`}</span></td>
          <td>${escapeHtml(product.synced_at || "-")}</td>
        </tr>`;
        }).join("") : `<tr><td colspan="6"><div class="empty">Nog geen producten gesynchroniseerd. Klik op Producten syncen.</div></td></tr>`}</tbody>
      </table>
    </div>
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
  const securitySummary = securityEventSummary();
  const securityEvents = recentSecurityEvents(12);
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
    ${kpiGrid([{ label: "Gratis claims", value: claimStats.total_claims || 0, help: `${claimStats.unique_ips || 0} unieke IP-hashes.`, icon: "ShieldCheck" }, { label: "Hoge risico's", value: highRiskIps, help: "IP-hashes met meerdere risicosignalen.", icon: "ShieldAlert" }, { label: "Security events", value: securitySummary.total, help: `${securitySummary.uniqueIps} unieke IP-hashes gelogd.`, icon: "LockKeyhole" }, { label: "Orderdekking", value: percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0), help: ruleLabel(rule), icon: "Target" }])}
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
    <div class="section-head"><h2>Security events</h2><span class="muted">Rate-limits, dubbele gratis deelname en blokkerende signalen.</span></div>
    <div class="panel">
      <table>
        <thead><tr><th>Tijd</th><th>Event</th><th>IP-hash</th><th>Email-hash</th><th>Pad</th><th>Bericht</th></tr></thead>
        <tbody>${securityEvents.length ? securityEvents.map((event) => `<tr>
          <td>${escapeHtml(event.created_at)}</td>
          <td><strong>${escapeHtml(securityEventLabel(event.event_type))}</strong><span class="muted">${escapeHtml(event.event_type)}</span></td>
          <td>${event.ip_hash ? `<strong>${escapeHtml(String(event.ip_hash).slice(0, 12))}...</strong>` : `<span class="muted">-</span>`}</td>
          <td>${event.email_hash ? `<strong>${escapeHtml(String(event.email_hash).slice(0, 12))}...</strong>` : `<span class="muted">-</span>`}</td>
          <td>${escapeHtml(event.path || "-")}</td>
          <td>${escapeHtml(event.message || "-")}</td>
        </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Nog geen security events gelogd.</div></td></tr>`}</tbody>
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
  const products = productSyncStatus();
  const productSales = productSalesSummary();
  res.send(page("Synchronisatie | Meat For Free", "sync", `
    ${topbar("Synchronisatie", "Systeemacties voor datakwaliteit.", "Gebruik deze pagina als Shopify data, klantdashboards of loten niet gelijk lopen.", "")}
    ${kpiGrid([{ label: "Geschikt zonder lot", value: metrics.eligibleWithoutEntry, help: "Na ordersynchronisatie moet dit dalen.", icon: "PackageSearch" }, { label: "Live loten", value: metrics.activeLiveEntries, help: "Beschikbaar in live acties.", icon: "Tickets" }, { label: "Producten", value: products.available, help: products.lastSyncedAt ? `Laatste sync ${products.lastSyncedAt.slice(0, 10)}.` : "Nog geen product-sync.", icon: "Beef" }, { label: "Orderregels", value: productSales.lineCount, help: `${productSales.orderCount} orders met productdata.`, icon: "ReceiptText" }])}
    <section class="grid grid-2">
      <div class="panel panel-pad"><div class="panel-title"><h2>Orders met loten synchroniseren</h2></div><p class="muted">Reconcilieert orders die recht hebben op loten maar nog geen lot kregen.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/reconcile"><button type="submit">Orders synchroniseren</button></form></div></div>
      <div class="panel panel-pad"><div class="panel-title"><h2>Klantdashboards synchroniseren</h2></div><p class="muted">Schrijft de huidige lotdata terug naar Shopify klantmetafields.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/sync-dashboards"><button class="button--gold" type="submit">Klantdashboards synchroniseren</button></form></div></div>
      <div class="panel panel-pad"><div class="panel-title"><h2>Productkaarten synchroniseren</h2></div><p class="muted">Haalt actieve Shopify producten, prijzen, afbeeldingen en status-tags op voor de storefront kaarten.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/sync-products"><button class="button--gold" type="submit">Producten synchroniseren</button></form></div></div>
      <div class="panel panel-pad"><div class="panel-title"><h2>Orderregels verrijken</h2></div><p class="muted">Haalt line-items op voor bestaande lokale orders. Dit vult productomzet en bestverkopende cuts zonder nieuwe loten te maken.</p><div style="margin-top:16px"><form class="inline-form" method="post" action="/admin/sync-order-items"><button class="button--gold" type="submit">Orderregels ophalen</button></form></div></div>
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

const widgetFieldLabels = {
  kicker: ["Label boven titel", "Kleine tekst boven de heading."],
  heading: ["Heading", "De grote titel in de widget."],
  body: ["Korte tekst", "Hou dit kort. Gebruik {rule}, {remaining} of {threshold} waar aangegeven."],
  cardTitle: ["Clubtitel", "Titel in de visuele membership-kaart."],
  cardText: ["Clubtekst", "Korte uitleg in de visuele membership-kaart. Hou dit compact."],
  primaryLabel: ["Primaire knop", "Tekst op de hoofdknop."],
  primaryUrl: ["Primaire knop link", "Bijv. /collections/all of /pages/actieve-loterijen."],
  secondaryLabel: ["Tweede knop", "Tekst op de tweede knop."],
  secondaryUrl: ["Tweede knop link", "Bijv. /pages/actieve-loterijen."],
  prizeLabel: ["Prijslabel", "Kleine tekst boven de hoofdprijs."],
  fallbackPrize: ["Fallback prijs", "Wordt gebruikt als er geen live prijs is."],
  fallbackPrizeValue: ["Fallback prijswaarde", "Korte fallback onder de prijs."],
  badge: ["Badge", "Kleine badge boven de cart-progress."],
  reachedHeading: ["Titel als lot actief is", "Als de klant over de grens zit."],
  remainingHeading: ["Titel onder grens", "Gebruik {remaining} voor het resterende bedrag."],
  emptyBody: ["Tekst lege winkelwagen", "Gebruik {threshold} voor de lotgrens."],
  reachedBody: ["Tekst lot bereikt", "Als de klant genoeg in de cart heeft."],
  remainingBody: ["Tekst nog niet genoeg", "Onder de lotgrens."],
  cartLabel: ["Cart label", "Label voor het cartbedrag."],
  thresholdLabel: ["Drempel label", "Label voor de lotgrens."],
  primaryLabelFilled: ["Knop met items", "Primaire knop als cart gevuld is."],
  primaryLabelEmpty: ["Knop lege cart", "Primaire knop als cart leeg is."],
  primaryUrlFilled: ["Link met items", "Meestal /checkout."],
  primaryUrlEmpty: ["Link lege cart", "Meestal /collections/all."],
  emptyLabel: ["Lege staat tekst", "Als er nog geen winnaars zijn."],
  emptyValue: ["Lege staat waarde", "Rechter label in lege staat."],
  winnerSource: ["Bron winnaars", "Automatisch gebruikt getrokken winnaars. Handmatig gebruikt de vier kaarten hieronder."],
  winnerOneName: ["Winnaar 1 naam", "Naam zoals bezoekers die mogen zien."],
  winnerOnePrize: ["Winnaar 1 prijs", "Bijv. BBQ Box, vleespakket of shoptegoed."],
  winnerOneStory: ["Winnaar 1 verhaal", "Een korte echte zin. Bijvoorbeeld: Mark won na zijn weekendbestelling."],
  winnerOneImageUrl: ["Winnaar 1 foto", "Upload hier of gebruik een bestaande CDN-link."],
  winnerTwoName: ["Winnaar 2 naam", "Naam zoals bezoekers die mogen zien."],
  winnerTwoPrize: ["Winnaar 2 prijs", "Bijv. BBQ Box, vleespakket of shoptegoed."],
  winnerTwoStory: ["Winnaar 2 verhaal", "Een korte echte zin."],
  winnerTwoImageUrl: ["Winnaar 2 foto", "Upload hier of gebruik een bestaande CDN-link."],
  winnerThreeName: ["Winnaar 3 naam", "Naam zoals bezoekers die mogen zien."],
  winnerThreePrize: ["Winnaar 3 prijs", "Bijv. BBQ Box, vleespakket of shoptegoed."],
  winnerThreeStory: ["Winnaar 3 verhaal", "Een korte echte zin."],
  winnerThreeImageUrl: ["Winnaar 3 foto", "Upload hier of gebruik een bestaande CDN-link."],
  winnerFourName: ["Winnaar 4 naam", "Naam zoals bezoekers die mogen zien."],
  winnerFourPrize: ["Winnaar 4 prijs", "Bijv. BBQ Box, vleespakket of shoptegoed."],
  winnerFourStory: ["Winnaar 4 verhaal", "Een korte echte zin."],
  winnerFourImageUrl: ["Winnaar 4 foto", "Upload hier of gebruik een bestaande CDN-link."],
  loggedInFallback: ["Dashboard fallback", "Tekst in ingelogde dashboard als er geen actie is."],
  buttonLabel: ["Knoptekst", "Tekst op de knop."],
  buttonUrl: ["Knoplink", "Waar de knop naartoe gaat."],
  panelBadge: ["Panel badge", "Kleine badge in het dashboardpaneel."],
  personalLabel: ["Persoonlijke regel", "Label voor persoonlijke loten."],
  personalValue: ["Persoonlijke waarde", "Waarde voordat klant is ingelogd."],
  qualifiesHeading: ["Titel product haalt lot", "Als productprijs boven de lotgrens zit."],
  qualifiesBody: ["Tekst product haalt lot", "Uitleg bij kwalificerend product."],
  proofOne: ["PDP bewijs 1", "Korte chip onder de productpagina lot-uitleg."],
  proofTwo: ["PDP bewijs 2", "Korte chip onder de productpagina lot-uitleg."],
  proofThree: ["PDP bewijs 3", "Korte chip onder de productpagina lot-uitleg."],
  firstNamePlaceholder: ["Placeholder voornaam", "Formulier placeholder."],
  lastNamePlaceholder: ["Placeholder achternaam", "Formulier placeholder."],
  emailPlaceholder: ["Placeholder e-mail", "Formulier placeholder."],
  loadingText: ["Laadtekst", "Tekst tijdens verzenden."],
  duplicateText: ["Dubbele deelname", "Tekst als deelname al bestaat."],
  successPrefix: ["Succes tekst", "Tekst voor het lotnummer."],
  collectionUrl: ["Collectielink", "Waar bezoekers alle producten openen."],
  detailLabel: ["Details-link", "Label voor de link naar de productpagina."],
  cartLabel: ["Cart knop", "Label voor directe add-to-cart."],
  soldOutLabel: ["Fallback knop", "Als er geen variant ID is ingevuld."],
  lotLabel: ["Lot label", "Korte tekst bij productbijdrage richting gratis lot."],
  cueOne: ["Product cue 1", "Korte trust/lot chip boven productkaarten."],
  cueTwo: ["Product cue 2", "Korte trust/lot chip boven productkaarten."],
  cueThree: ["Product cue 3", "Korte trust/lot chip boven productkaarten."],
  productSource: ["Productbron", "Shopify-sync gebruikt actuele producten. Handmatig gebruikt de velden hieronder."],
  productLimit: ["Aantal producten", "Aantal gesynchroniseerde producten in de carousel."],
  productStatusFilter: ["Status-filter", "Optioneel: toon alleen Deal, Nieuw, Populair of Laatste kans."],
  productOneTitle: ["Product 1 titel", "Naam op de kaart."],
  productOneTag: ["Product 1 tag", "Korte status-tag op de afbeelding, bijvoorbeeld Deal."],
  productOneDescription: ["Product 1 tekst", "Korte beschrijving."],
  productOneImageUrl: ["Product 1 afbeelding", "Upload hier of gebruik een bestaande CDN-link."],
  productOneUrl: ["Product 1 link", "Productpagina of collectie."],
  productOneVariantId: ["Product 1 variant ID", "Nodig voor directe add-to-cart."],
  productOnePriceCents: ["Product 1 prijs centen", "Bijv. 3495 voor EUR 34,95."],
  productOneCompareAtCents: ["Product 1 van-prijs centen", "Optioneel voor korting."],
  productTwoTitle: ["Product 2 titel", "Naam op de kaart."],
  productTwoTag: ["Product 2 tag", "Korte status-tag op de afbeelding, bijvoorbeeld Nieuw."],
  productTwoDescription: ["Product 2 tekst", "Korte beschrijving."],
  productTwoImageUrl: ["Product 2 afbeelding", "Upload hier of gebruik een bestaande CDN-link."],
  productTwoUrl: ["Product 2 link", "Productpagina of collectie."],
  productTwoVariantId: ["Product 2 variant ID", "Nodig voor directe add-to-cart."],
  productTwoPriceCents: ["Product 2 prijs centen", "Bijv. 5995 voor EUR 59,95."],
  productTwoCompareAtCents: ["Product 2 van-prijs centen", "Optioneel voor korting."],
  productThreeTitle: ["Product 3 titel", "Naam op de kaart."],
  productThreeTag: ["Product 3 tag", "Korte status-tag op de afbeelding, bijvoorbeeld Populair."],
  productThreeDescription: ["Product 3 tekst", "Korte beschrijving."],
  productThreeImageUrl: ["Product 3 afbeelding", "Upload hier of gebruik een bestaande CDN-link."],
  productThreeUrl: ["Product 3 link", "Productpagina of collectie."],
  productThreeVariantId: ["Product 3 variant ID", "Nodig voor directe add-to-cart."],
  productThreePriceCents: ["Product 3 prijs centen", "Bijv. 7995 voor EUR 79,95."],
  productThreeCompareAtCents: ["Product 3 van-prijs centen", "Optioneel voor korting."],
  productFourTitle: ["Product 4 titel", "Naam op de kaart."],
  productFourTag: ["Product 4 tag", "Korte status-tag op de afbeelding, bijvoorbeeld Laatste kans."],
  productFourDescription: ["Product 4 tekst", "Korte beschrijving."],
  productFourImageUrl: ["Product 4 afbeelding", "Upload hier of gebruik een bestaande CDN-link."],
  productFourUrl: ["Product 4 link", "Productpagina of collectie."],
  productFourVariantId: ["Product 4 variant ID", "Nodig voor directe add-to-cart."],
  productFourPriceCents: ["Product 4 prijs centen", "Bijv. 2500 voor EUR 25,00."],
  productFourCompareAtCents: ["Product 4 van-prijs centen", "Optioneel voor korting."]
};

const widgetVisualLabels = {
  visualTheme: ["Visuele basis", "Bewaar als MFF tenzij je bewust afwijkt."],
  backgroundColor: ["Achtergrond", "Buitenste kleur van de widget."],
  surfaceColor: ["Vlak kleur", "Kaarten, velden en lichte panelen."],
  textColor: ["Tekstkleur", "Hoofdkleur voor titels en tekst."],
  mutedColor: ["Subtekst", "Kleur voor rustige ondersteunende tekst."],
  accentColor: ["Accent", "Knoppen, badges en beloningen."],
  secondaryColor: ["Tweede accent", "Meestal rood voor urgentie of live."],
  borderColor: ["Lijnen", "Randen, harde schaduw en outline."],
  backgroundImageUrl: ["Achtergrondafbeelding", "Upload een beeld of gebruik een bestaande CDN-link."],
  backgroundImageOpacity: ["Afbeelding dekking", "0 is uit. 100 is volledig zichtbaar."],
  backgroundImagePosition: ["Achtergrondpositie", "Bijv. center center, center bottom of 80% 50%."],
  visualImageUrl: ["Los beeld / PNG", "Upload product, prijs of sfeerbeeld dat in de widget meeloopt."],
  visualImageAlt: ["Alt tekst beeld", "Korte beschrijving voor toegankelijkheid."],
  cornerStyle: ["Hoekstijl", "MFF is de huidige branded vorm."],
  shadowStyle: ["Schaduw", "Harde MFF-schaduw, zacht of uit."]
};

const visualFieldKeys = Object.keys(widgetVisualDefaults);

function isUploadableImageField(key) {
  return key === "backgroundImageUrl" || key === "visualImageUrl" || /ImageUrl$/i.test(key);
}

function widgetUploadControl(key) {
  if (!isUploadableImageField(key)) return "";
  return `<div class="widget-upload">
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-widget-upload="${escapeHtml(key)}" aria-label="Upload afbeelding voor ${escapeHtml(key)}">
    <span class="widget-upload-status" data-upload-status="${escapeHtml(key)}">Max 4MB</span>
  </div>`;
}

function widgetField(key, value) {
  const [labelText, help] = widgetFieldLabels[key] || [key, ""];
  if (key === "productSource") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("synced", value, "Shopify-sync")}${option("manual", value, "Handmatig")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "productStatusFilter") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("", value, "Geen filter")}${option("Deal", value, "Alleen deals")}${option("Nieuw", value, "Alleen nieuw")}${option("Populair", value, "Alleen populair")}${option("Laatste kans", value, "Alleen urgentie")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "winnerSource") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("automatic", value, "Getrokken winnaars")}${option("manual", value, "Handmatig beheerd")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "productLimit") {
    return `<label>${escapeHtml(labelText)}<input name="${escapeHtml(key)}" inputmode="numeric" value="${escapeHtml(value || "8")}">${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  const isLong = /body|text|story/i.test(key) || String(value || "").length > 80;
  const input = isLong
    ? `<textarea name="${escapeHtml(key)}">${escapeHtml(value)}</textarea>`
    : `<input name="${escapeHtml(key)}" value="${escapeHtml(value)}">`;
  return `<label${isLong || isUploadableImageField(key) ? ' class="wide"' : ""}>${escapeHtml(labelText)}${input}${widgetUploadControl(key)}${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
}

function widgetVisualField(key, value) {
  const [labelText, help] = widgetVisualLabels[key] || [key, ""];
  if (/Color$/.test(key)) {
    const clean = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : widgetVisualDefaults[key];
    return `<label>${escapeHtml(labelText)}<div class="widget-color-row"><input type="color" name="${escapeHtml(key)}" value="${escapeHtml(clean)}"><input name="${escapeHtml(key)}_text" value="${escapeHtml(clean)}" data-color-text="${escapeHtml(key)}"></div>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "backgroundImageOpacity") {
    return `<label>${escapeHtml(labelText)}<input type="range" name="${escapeHtml(key)}" min="0" max="100" step="1" value="${escapeHtml(value || "0")}"><span class="widget-field-help">${escapeHtml(help)}</span></label>`;
  }
  if (key === "cornerStyle") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("mff", value, "MFF hoek")}${option("sharp", value, "Strak vierkant")}${option("soft", value, "Rustiger rond")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "shadowStyle") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("hard", value, "Harde MFF-schaduw")}${option("soft", value, "Zachte schaduw")}${option("none", value, "Geen schaduw")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  if (key === "visualTheme") {
    return `<label>${escapeHtml(labelText)}<select name="${escapeHtml(key)}">${option("mff", value, "Meat For Free")}${option("clean", value, "Schoon licht")}${option("promo", value, "Promotie")}</select>${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
  }
  const isUrl = /Url$/i.test(key);
  const isLong = key === "backgroundImagePosition";
  return `<label${isLong || isUrl ? ' class="wide"' : ""}>${escapeHtml(labelText)}<input name="${escapeHtml(key)}" value="${escapeHtml(value)}"${isUrl ? ' inputmode="url" placeholder="/uploads/... of Shopify CDN URL"' : ""}>${widgetUploadControl(key)}${help ? `<span class="widget-field-help">${escapeHtml(help)}</span>` : ""}</label>`;
}

function widgetPreviewScript() {
  return `<script>
    (() => {
      const readSettings = (form) => {
        const settings = {};
        new FormData(form).forEach((value, field) => {
          if (field.startsWith("_")) return;
          if (field.endsWith("_text")) return;
          settings[field] = value;
        });
        return settings;
      };
      const normalize = (settings) => {
        return JSON.stringify(Object.keys(settings).sort().reduce((acc, key) => {
          acc[key] = String(settings[key] == null ? "" : settings[key]);
          return acc;
        }, {}));
      };
      const enc = (value) => {
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        let binary = "";
        bytes.forEach((byte) => binary += String.fromCharCode(byte));
        return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      };
      const updatePreview = (form) => {
        const key = form.dataset.widgetKey;
        const frame = document.querySelector('[data-widget-preview="' + key + '"]');
        const state = document.querySelector('[data-widget-preview-state="' + key + '"]');
        if (!frame) return;
        const settings = readSettings(form);
        const saved = form.dataset.savedSettings || "{}";
        const isSaved = normalize(settings) === saved;
        if (state) {
          state.textContent = isSaved ? "Saved live" : "Draft";
          state.classList.toggle("status--active", isSaved);
          state.classList.toggle("status--pending", !isSaved);
        }
        frame.src = isSaved
          ? "/embed/frame?widget=" + encodeURIComponent(key) + "&ts=" + Date.now()
          : "/embed/frame?widget=" + encodeURIComponent(key) + "&preview=" + encodeURIComponent(enc({ key, settings })) + "&ts=" + Date.now();
      };
      document.querySelectorAll("[data-widget-form]").forEach((form) => {
        try {
          const parsed = JSON.parse(form.dataset.savedSettings || "{}");
          form.dataset.savedSettings = normalize(parsed);
        } catch (_error) {
          form.dataset.savedSettings = normalize({});
        }
        const refresh = () => updatePreview(form);
        form.addEventListener("input", (event) => {
          const target = event.target;
          if (target && target.matches('input[type="color"]')) {
            const pair = form.querySelector('[data-color-text="' + target.name + '"]');
            if (pair) pair.value = target.value;
          }
          window.clearTimeout(form._previewTimer);
          form._previewTimer = window.setTimeout(refresh, 180);
        });
        form.addEventListener("change", refresh);
        form.querySelectorAll("[data-color-text]").forEach((input) => {
          input.addEventListener("input", () => {
            const color = form.querySelector('input[type="color"][name="' + input.dataset.colorText + '"]');
            if (color && /^#[0-9a-f]{6}$/i.test(input.value)) color.value = input.value;
          });
        });
        form.querySelectorAll("[data-widget-upload]").forEach((input) => {
          input.addEventListener("change", async () => {
            const field = input.dataset.widgetUpload;
            const file = input.files && input.files[0];
            const status = form.querySelector('[data-upload-status="' + field + '"]');
            const target = form.querySelector('[name="' + field + '"]');
            if (!file || !target) return;
            if (status) {
              status.textContent = "Uploaden...";
              status.classList.remove("widget-upload-status--ok", "widget-upload-status--error");
            }
            try {
              const body = new FormData();
              body.append("image", file);
              body.append("field", field);
              const csrf = form.querySelector('[name="_csrf"]')?.value || "";
              const response = await fetch("/admin/uploads", {
                method: "POST",
                headers: csrf ? { "X-CSRF-Token": csrf } : {},
                body
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok || !data.url) throw new Error(data.error || "Upload mislukt.");
              target.value = data.url;
              target.dispatchEvent(new Event("input", { bubbles: true }));
              refresh();
              if (status) {
                status.textContent = "Geupload";
                status.classList.add("widget-upload-status--ok");
              }
            } catch (error) {
              if (status) {
                status.textContent = error.message || "Upload mislukt";
                status.classList.add("widget-upload-status--error");
              }
            } finally {
              input.value = "";
            }
          });
        });
        refresh();
      });
      document.querySelectorAll("[data-preview-size]").forEach((preview) => {
        preview.addEventListener("click", (event) => {
          const button = event.target.closest("[data-preview-size-button]");
          if (!button) return;
          const size = button.dataset.previewSizeButton || "desktop";
          preview.dataset.previewSize = size;
          preview.querySelectorAll("[data-preview-size-button]").forEach((item) => {
            item.setAttribute("aria-pressed", String(item === button));
          });
        });
      });
    })();
  </script>`;
}

function widgetEditorCard(definition) {
  const settings = getWidgetSettings(definition.key);
  const contentKeys = Object.keys(definition.defaults);
  const savedSettings = escapeHtml(JSON.stringify(settings));
  return `<article class="widget-editor-card" id="widget-${escapeHtml(definition.key)}">
    <div class="widget-editor-head">
      <div>
        <h2>${escapeHtml(definition.label)}</h2>
        <p class="helper">${escapeHtml(definition.description)}</p>
      </div>
      <span class="status status--active">${escapeHtml(definition.key)}</span>
    </div>
    <div class="widget-editor-body">
      <form method="post" action="/admin/widgets/${escapeHtml(definition.key)}" class="stack" data-widget-form data-widget-key="${escapeHtml(definition.key)}" data-saved-settings="${savedSettings}">
        <div class="widget-fieldset">
          <div class="widget-fieldset-title"><span>Content</span><span class="widget-live-note">Tekst, knoppen en links</span></div>
          <div class="form-grid">
            ${contentKeys.map((key) => widgetField(key, settings[key])).join("")}
          </div>
        </div>
        <div class="widget-fieldset">
          <div class="widget-fieldset-title"><span>Visuals</span><span class="widget-live-note">Kleuren, beelden en vorm</span></div>
          <div class="form-grid">
            ${visualFieldKeys.map((key) => widgetVisualField(key, settings[key])).join("")}
          </div>
        </div>
        <div class="actions">
          <button class="button--gold" type="submit">${icon("Save")}Opslaan</button>
          <a class="button button--ghost" href="/embed/frame?widget=${escapeHtml(definition.key)}" target="_blank" rel="noreferrer">${icon("ExternalLink")}Open groot</a>
        </div>
      </form>
      <aside class="widget-preview" data-preview-size="desktop" aria-label="Live preview ${escapeHtml(definition.label)}">
        <div class="widget-preview-head">
          <div>
            <p class="eyebrow">Live preview</p>
            <h3>${escapeHtml(definition.label)}</h3>
          </div>
          <span class="status status--active" data-widget-preview-state="${escapeHtml(definition.key)}">Saved live</span>
        </div>
        <div class="widget-preview-tools" aria-label="Preview formaat">
          <button class="widget-preview-toggle" type="button" data-preview-size-button="desktop" aria-pressed="true">Desktop</button>
          <button class="widget-preview-toggle" type="button" data-preview-size-button="mobile" aria-pressed="false">Mobiel</button>
        </div>
        <div class="widget-preview-shell">
          <iframe class="widget-preview-frame" data-widget-preview="${escapeHtml(definition.key)}" title="${escapeHtml(definition.label)} preview"></iframe>
        </div>
        <p class="widget-live-note">Saved live gebruikt exact de opgeslagen embed. Draft verschijnt alleen wanneer je velden wijzigt.</p>
      </aside>
    </div>
  </article>`;
}

adminRouter.get("/widgets", (_req, res) => {
  res.send(page("Widgets | Meat For Free", "widgets", `
    ${topbar("Widgets", "Pas elk embed los aan.", "Gewoon invullen wat bezoekers zien: titels, korte tekst, knoppen en links. Geen code nodig.", `<a class="button button--gold" href="/embed/demo" target="_blank" rel="noreferrer">${icon("ExternalLink")}Open demo</a>`)}
    <section class="widget-editor">
      ${widgetDefinitions.map(widgetEditorCard).join("")}
    </section>
    ${widgetPreviewScript()}
  `));
});

adminRouter.post("/widgets/:widgetKey", urlencoded, (req, res) => {
  try {
    updateWidgetSettings(req.params.widgetKey, req.body || {});
    writeAuditLog({
      actor: "admin",
      action: "UPDATE_WIDGET_SETTINGS",
      targetType: "widget",
      targetId: req.params.widgetKey,
      message: `Widget ${req.params.widgetKey} bijgewerkt.`
    });
    res.redirect("/admin/widgets");
  } catch (error) {
    res.status(400).send(page("Widget fout | Meat For Free", "widgets", topbar("Niet opgeslagen", "Widget kon niet worden opgeslagen.", error.message, `<a class="button button--gold" href="/admin/widgets">Terug</a>`)));
  }
});

adminRouter.get("/embed", (_req, res) => {
  const widgets = [
    ["live", "Homepage live winactie", "Hero/section met hoofdprijs, lotregel en countdown."],
    ["cart", "Cart gratis-lot progress", "Toont hoeveel er nog nodig is tot een gratis lot. Gebruik liefst als directe Shopify script embed."],
    ["winners", "Laatste winnaars", "Compact bewijsblok met recente winnaars."],
    ["product-cards", "Homepage productkaarten", "Productcards met korting, details en directe add-to-cart."],
    ["customer", "Mijn MFF teaser", "Klantdashboard entrypoint met live status."],
    ["pdp", "PDP lot-progress", "Compact productblok: laat zien of dit product al richting een gratis lot telt."],
    ["free-entry", "Gratis deelname", "Formulier voor 1 keer gratis meedoen."],
    ["how-it-works", "Hoe het werkt", "Homepage uitleg: bestellen, lot krijgen en trekking volgen."],
    ["trust", "Trust en bewijs", "Herkomst, levering, reviews en transparantie."],
    ["membership", "Membership", "Abonnement, clubvoordeel en Mijn MFF route."],
    ["community", "Community en inspiratie", "BBQ inspiratie, klantcontent en challenges."]
  ];
  const widgetSnippet = (type) => {
    if (type === "pdp") return '<div data-dvl-lottery="pdp" data-product-price-cents="{{ product.price }}" data-product-title="{{ product.title | escape }}" data-product-image="{{ product.featured_image | image_url: width: 180 }}" data-product-url="{{ product.url }}"></div>';
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
  if (!hasAdminPermission(req.adminUser, "view_entries")) {
    return res.status(403).send("Je hebt geen rechten om deelnemerdata te exporteren.");
  }
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
  writeAuditLog({
    actor: actor(req),
    action: "LOTEN_CSV_GEEXPORTEERD",
    targetType: "lottery_draw",
    targetId: draw.id,
    message: `${rows.length} loten geexporteerd voor ${draw.title}.`,
    metadata: { rowCount: rows.length, includesPii: true }
  });
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

adminRouter.post("/sync-products", async (req, res) => {
  try {
    const result = await syncShopifyProducts({ limit: 100 });
    writeAuditLog({
      actor: actor(req),
      action: "SHOPIFY_PRODUCTEN_GESYNCHRONISEERD",
      targetType: "shopify_products",
      message: `${result.synced || 0} producten bijgewerkt`,
      metadata: result
    });
    res.redirect("/admin/producten");
  } catch (error) {
    writeAuditLog({
      actor: actor(req),
      action: "SHOPIFY_PRODUCTEN_SYNC_MISLUKT",
      targetType: "shopify_products",
      message: error.message
    });
    res.status(400).send(page("Product sync fout | Meat For Free", "producten", topbar("Sync mislukt", "Shopify producten konden niet worden bijgewerkt.", error.message, `<a class="button button--gold" href="/admin/producten">Terug</a>`)));
  }
});

adminRouter.post("/sync-order-items", async (req, res) => {
  const result = await syncStoredOrderLineItems({ limit: 75 });
  writeAuditLog({
    actor: actor(req),
    action: "ORDERREGELS_GESYNCHRONISEERD",
    targetType: "order_items",
    message: `${result.updatedLineItems || 0} orderregels bijgewerkt`,
    metadata: result
  });
  res.redirect("/admin/sync");
});

function drawForm(draw, action, submitLabel) {
  const statusOptions = draw?.status === "DRAWN" ? ["DRAWN", ...editableDrawStatuses] : editableDrawStatuses;
  return `<form method="post" action="${action}">
    <div class="form-grid">
      <label>Titel<input name="title" required value="${escapeHtml(draw?.title || "")}" placeholder="Bijv. Juli BBQ trekking"></label>
      <label>Slug<input name="slug" value="${escapeHtml(draw?.slug || "")}" placeholder="juli-bbq-trekking"><span class="helper">Voor URL/API herkenning. Laat leeg bij nieuw voor automatische slug.</span></label>
      <label>Prijsnaam<input name="prizeName" required value="${escapeHtml(draw?.prize_name || "")}" placeholder="Bijv. 1 jaar gratis vlees"></label>
      <label>Prijswaarde<input name="prizeValue" value="${escapeHtml(draw?.prize_value || "")}" placeholder="Bijv. Hoofdprijs t.w.v. €1.200"></label>
      <label>Startdatum<input type="date" name="startsAt" value="${escapeHtml(dateInput(draw?.starts_at))}"></label>
      <label>Einddatum<input type="date" name="endsAt" value="${escapeHtml(dateInput(draw?.ends_at))}"></label>
      <label>Trekdatum<input type="date" name="drawAt" value="${escapeHtml(dateInput(draw?.draw_at))}"></label>
      <label>Status<select name="status">${statusOptions.map((status) => option(status, draw?.status || "DRAFT", statusLabel(status))).join("")}</select><span class="helper">Getrokken status ontstaat via winnaar trekken, niet handmatig.</span></label>
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
