import express from "express";
import { db, nowIso } from "../db.js";
import { createDraw, drawWinner } from "../services/lottery.js";
import { syncAllCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { formatEuro } from "../utils.js";

export const adminRouter = express.Router();

const urlencoded = express.urlencoded({ extended: false });
const drawStatuses = ["DRAFT", "LIVE", "DRAWN", "ARCHIVED"];
const entryStatuses = ["ACTIVE", "WINNER", "VOID"];
const entrySources = ["ORDER_THRESHOLD", "FREE_ENTRY", "MANUAL", "SUBSCRIPTION"];

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

function page(title, active, body) {
  const menu = [
    ["overzicht", "/admin", "OV", "Overzicht"],
    ["winacties", "/admin/winacties", "WA", "Winacties"],
    ["loten", "/admin/loten", "LT", "Loten"],
    ["orders", "/admin/orders", "OR", "Orders"],
    ["deelnemers", "/admin/deelnemers", "KL", "Deelnemers"],
    ["compliance", "/admin/compliance", "CP", "Compliance"],
    ["sync", "/admin/sync", "SY", "Synchronisatie"],
    ["api", "/admin/api", "API", "API"],
    ["nieuw", "/admin/new-draw", "+", "Nieuwe winactie"],
    ["embed", "/admin/embed", "EM", "Embed voorbeeld"]
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
          --bg:#f3f5f8;
          --panel:#fff;
          --ink:#111827;
          --muted:#6b7280;
          --line:#d8dee8;
          --line-soft:#edf0f4;
          --red:#b42318;
          --red-dark:#8a1c13;
          --gold:#d39a17;
          --green:#157347;
          --blue:#2563eb;
          --cyan:#0e9aa7;
          --shadow:0 10px 26px rgba(17,24,39,.07);
        }
        * { box-sizing:border-box; }
        html, body { margin:0; min-height:100%; background:var(--bg); color:var(--ink); font-family:Manrope, ui-sans-serif, system-ui, sans-serif; }
        body { font-weight:650; }
        a { color:inherit; }
        .app-shell { min-height:100vh; display:grid; grid-template-columns:260px minmax(0,1fr); }
        .sidebar { position:sticky; top:0; height:100vh; overflow:auto; padding:20px 14px; background:#111827; color:#f9fafb; }
        .sidebar-brand { display:flex; align-items:center; gap:10px; padding:0 6px 20px; color:inherit; text-decoration:none; }
        .mark { width:38px; height:38px; display:grid; place-items:center; border-radius:8px; background:var(--red); color:#fff; font-weight:950; font-size:13px; }
        .sidebar-brand strong, .brand strong { display:block; font-size:17px; line-height:1.02; font-weight:950; }
        .sidebar-brand span span, .brand span span { display:block; margin-top:4px; color:rgba(249,250,251,.58); font-size:10px; font-weight:850; letter-spacing:.08em; text-transform:uppercase; }
        .brand span span { color:var(--muted); }
        .menu-title { margin:18px 8px 8px; color:rgba(249,250,251,.48); font-size:10px; font-weight:900; letter-spacing:.1em; text-transform:uppercase; }
        .menu-link { min-height:38px; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:8px; color:rgba(249,250,251,.74); text-decoration:none; font-size:13px; font-weight:800; }
        .menu-link:hover, .menu-link:focus-visible, .menu-link--active { background:rgba(255,255,255,.08); color:#fff; outline:none; }
        .menu-left { display:flex; align-items:center; gap:10px; min-width:0; }
        .menu-icon { width:24px; height:24px; display:grid; place-items:center; flex:0 0 auto; border-radius:7px; background:rgba(255,255,255,.08); color:#f5c451; font-size:9px; font-weight:950; }
        .content { min-width:0; }
        header { position:sticky; top:0; z-index:5; min-height:64px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:12px 24px; border-bottom:1px solid var(--line); background:rgba(255,255,255,.94); backdrop-filter:blur(14px); }
        .brand { display:flex; align-items:center; gap:10px; text-decoration:none; }
        .top-tools { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
        main { width:min(100%,1440px); margin:0 auto; padding:26px clamp(18px,3vw,34px) 56px; }
        h1, h2, h3, p { margin:0; }
        h1 { max-width:800px; font-size:clamp(32px,4vw,48px); line-height:1.05; font-weight:950; }
        h2 { font-size:clamp(20px,2vw,28px); line-height:1.1; font-weight:950; }
        h3 { font-size:16px; line-height:1.25; font-weight:900; }
        .eyebrow { margin-bottom:8px; color:var(--red); font-size:11px; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }
        .muted { color:var(--muted); font-weight:650; }
        .topbar { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:16px; margin-bottom:20px; }
        .actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:flex-end; }
        .button, button { min-height:38px; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:0 14px; border:1px solid var(--red); border-radius:8px; background:var(--red); color:#fff; font:inherit; font-size:12px; font-weight:850; text-decoration:none; cursor:pointer; }
        .button:hover, button:hover, .button:focus-visible, button:focus-visible { background:var(--red-dark); border-color:var(--red-dark); outline:none; }
        .button--ghost { background:#fff; border-color:var(--line); color:var(--ink); }
        .button--ghost:hover, .button--ghost:focus-visible { background:#f8fafc; border-color:#c9d1dd; color:var(--ink); }
        .button--gold { background:#fff7db; border-color:#e7c76f; color:#5b3b00; }
        .button--gold:hover, .button--gold:focus-visible { background:#ffefb6; border-color:var(--gold); color:#5b3b00; }
        .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:24px; }
        .grid-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
        .grid-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .card, .panel, .filters { min-width:0; border:1px solid var(--line); border-radius:10px; background:var(--panel); box-shadow:none; }
        .card { min-height:126px; padding:18px; border-top:3px solid var(--red); }
        .card--blue { border-top-color:var(--blue); }
        .card--green { border-top-color:var(--green); }
        .card--cyan { border-top-color:var(--cyan); }
        .stat { margin-top:10px; color:var(--ink); font-size:clamp(28px,3.5vw,42px); line-height:1; font-weight:950; letter-spacing:0; }
        .card p:last-child { margin-top:8px; color:var(--muted); font-size:13px; }
        .section-head { display:flex; align-items:center; justify-content:space-between; gap:14px; margin:30px 0 12px; }
        .panel { overflow:hidden; }
        .panel-pad { padding:18px; }
        .panel-title { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:14px; }
        table { width:100%; border-collapse:collapse; background:transparent; }
        th, td { padding:12px 14px; border-bottom:1px solid var(--line-soft); text-align:left; vertical-align:middle; font-size:13px; }
        th { background:#f8fafc; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.05em; text-transform:uppercase; }
        td strong { display:block; font-size:14px; font-weight:900; }
        tbody tr:hover { background:#faf7f2; }
        .status { display:inline-flex; align-items:center; justify-content:center; min-width:0; padding:5px 9px; border:1px solid var(--line); border-radius:999px; background:#f8fafc; color:#374151; font-size:11px; font-weight:850; }
        .status--live, .status--active, .status--paid { background:#ecfdf3; border-color:#bbf7d0; color:#166534; }
        .status--drawn, .status--winner { background:#fff7db; border-color:#fde68a; color:#7a4b00; }
        .status--void, .status--cancelled, .status--refunded, .status--archived { background:#fef3f2; border-color:#fecaca; color:#991b1b; }
        .filters { padding:18px; margin-bottom:22px; }
        .filter-grid, .form-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; align-items:end; }
        .form-grid { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
        label { display:block; color:#4b5563; font-size:11px; font-weight:900; letter-spacing:.04em; text-transform:uppercase; }
        input, textarea, select { width:100%; min-height:40px; margin-top:6px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--ink); font:inherit; font-size:13px; font-weight:650; }
        textarea { min-height:108px; resize:vertical; }
        input:focus, textarea:focus, select:focus { outline:3px solid rgba(180,35,24,.12); border-color:var(--red); }
        .wide { grid-column:span 2; }
        form.inline-form { display:inline; margin:0; }
        .empty { padding:26px; color:var(--muted); font-size:14px; }
        .bar { height:8px; overflow:hidden; border-radius:999px; background:#e5e7eb; }
        .bar span { display:block; height:100%; border-radius:999px; background:var(--red); }
        .chart { height:220px; display:grid; grid-template-columns:repeat(12,minmax(10px,1fr)); align-items:end; gap:9px; padding:18px; border:1px solid var(--line); border-radius:10px; background:linear-gradient(180deg,#f8fafc,#fff); }
        .chart-bar { position:relative; min-height:5px; border-radius:6px 6px 2px 2px; background:var(--red); }
        .chart-bar:nth-child(3n) { background:var(--blue); }
        .chart-bar:nth-child(3n + 1) { background:var(--cyan); }
        .chart-labels { display:grid; grid-template-columns:repeat(12,minmax(10px,1fr)); gap:9px; margin:8px 18px 0; color:var(--muted); font-size:10px; text-align:center; }
        .stack { display:grid; gap:12px; }
        .metric-row { display:grid; gap:7px; }
        .metric-row > div:first-child { display:flex; justify-content:space-between; gap:12px; color:var(--muted); font-size:12px; font-weight:850; }
        .ops-item { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
        .ops-icon { width:34px; height:34px; display:grid; place-items:center; border-radius:8px; background:#fff4d6; color:#704900; font-size:11px; font-weight:950; }
        .helper { margin-top:8px; color:var(--muted); font-size:12px; font-weight:650; text-transform:none; letter-spacing:0; }
        @media (max-width:1100px) { .grid, .grid-3, .grid-2 { grid-template-columns:repeat(2,minmax(0,1fr)); } .filter-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:900px) {
          .app-shell { grid-template-columns:1fr; }
          .sidebar { position:relative; height:auto; padding:16px; }
          .menu { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
          .menu-title { grid-column:1 / -1; }
          header { position:relative; align-items:flex-start; flex-direction:column; }
          .topbar { grid-template-columns:1fr; align-items:start; }
          .grid, .grid-3, .grid-2 { grid-template-columns:1fr; }
          .form-grid { grid-template-columns:1fr; }
          .wide { grid-column:auto; }
          .panel { overflow-x:auto; }
          table { min-width:760px; }
        }
        @media (max-width:560px) {
          main { padding-inline:10px; }
          .filter-grid { grid-template-columns:1fr; }
          .top-tools, .actions { justify-content:flex-start; }
          h1 { font-size:34px; }
        }
      </style>
    </head>
    <body>
      <div class="app-shell">
        <aside class="sidebar" aria-label="Admin menu">
          <a class="sidebar-brand" href="/admin">
            <span class="mark">MFF</span>
            <span><strong>Meat For<br>Free</strong><span>Beheer</span></span>
          </a>
          <nav class="menu">
            <p class="menu-title">Beheer</p>
            ${menu.slice(0, 4).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Controle</p>
            ${menu.slice(4, 8).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
            <p class="menu-title">Acties</p>
            ${menu.slice(8).map(([key, href, icon, label]) => menuLink(active, key, href, icon, label)).join("")}
          </nav>
        </aside>
        <div class="content">
          <header>
            <a class="brand" href="/admin">
              <span class="mark">MFF</span>
              <span><strong>Meat For<br>Free</strong><span>Beheerdashboard</span></span>
            </a>
            <div class="top-tools">
              <a class="button button--ghost" href="/api/draws/live">Live API</a>
              <a class="button button--ghost" href="/admin/embed">Embed</a>
              <a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>
            </div>
          </header>
          <main>${body}</main>
        </div>
      </div>
    </body>
  </html>`;
}

function menuLink(active, key, href, icon, label) {
  return `<a class="menu-link${active === key ? " menu-link--active" : ""}" href="${href}">
    <span class="menu-left"><span class="menu-icon">${escapeHtml(icon)}</span>${escapeHtml(label)}</span>
  </a>`;
}

function titleBlock(eyebrow, title, copy = "") {
  return `<div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1>${copy ? `<p class="muted" style="margin-top:8px">${escapeHtml(copy)}</p>` : ""}</div>`;
}

function topbar(eyebrow, title, copy, actions = "") {
  return `<div class="topbar">${titleBlock(eyebrow, title, copy)}<div class="actions">${actions}</div></div>`;
}

function getMetrics() {
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
      SUM(CASE WHEN total_cents >= 7000 THEN 1 ELSE 0 END) AS eligible_orders
    FROM orders
  `).get();
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
    WHERE o.total_cents >= 7000 AND e.id IS NULL
  `).get().count;
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

function kpiGrid(items) {
  return `<section class="grid" aria-label="Kerncijfers">${items.map((item, index) => `<div class="card ${["", "card--cyan", "card--green", "card--blue"][index % 4]}">
    <p class="muted">${escapeHtml(item.label)}</p>
    <div class="stat">${item.value}</div>
    <p>${escapeHtml(item.help)}</p>
  </div>`).join("")}</section>`;
}

function monthChart() {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
    FROM lottery_entries
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();
  const chartRows = rows.length ? rows : Array.from({ length: 12 }, (_, index) => ({ month: `M${index + 1}`, count: 0 }));
  const max = Math.max(1, ...chartRows.map((row) => row.count));
  return `<div class="chart" aria-label="Lotvolume per maand">
    ${chartRows.map((row) => `<span class="chart-bar" title="${escapeHtml(row.month)}: ${row.count}" style="height:${ratio(row.count, max)}%"></span>`).join("")}
  </div>
  <div class="chart-labels">${chartRows.map((row) => `<span>${escapeHtml(String(row.month).slice(5) || row.month)}</span>`).join("")}</div>`;
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

function entryFilter(req) {
  const filter = {
    q: textParam(req.query.q),
    drawStatus: textParam(req.query.drawStatus),
    entryStatus: textParam(req.query.entryStatus),
    source: textParam(req.query.source),
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
  if (filter.entryStatus) {
    where.push("e.status = ?");
    params.push(filter.entryStatus);
  }
  if (filter.source) {
    where.push("e.source = ?");
    params.push(filter.source);
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
    minTotal: textParam(req.query.minTotal),
    maxTotal: textParam(req.query.maxTotal)
  };
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
  if (minCents !== null) {
    where.push("o.total_cents >= ?");
    params.push(minCents);
  }
  if (maxCents !== null) {
    where.push("o.total_cents <= ?");
    params.push(maxCents);
  }
  return { filter, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

adminRouter.get("/", (_req, res) => {
  const metrics = getMetrics();
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
    ["OR", `${metrics.eligibleWithoutEntry} geschikte orders zonder lot`, metrics.eligibleWithoutEntry ? "Ordersynchronisatie controleren" : "Geen actie nodig", metrics.eligibleWithoutEntry ? "Controle" : "Goed"],
    ["WA", `${metrics.liveDraws} live winactie(s)`, metrics.liveDrawsWithoutEntries ? `${metrics.liveDrawsWithoutEntries} zonder loten` : `${metrics.activeLiveEntries} actieve loten`, metrics.liveDraws ? "Live" : "Maak"],
    ["CP", `${percent(totals.free_entries || 0, totals.total_entries || 0)} gratis deelname`, "Gratis route zichtbaar houden voor compliance", "Monitoren"]
  ];

  res.send(page("Overzicht | Meat For Free", "overzicht", `
    ${topbar("Overzicht", "Sturing op loten, omzet en winacties.", "Eerste scherm voor dagelijkse controle: wat loopt, wat groeit, wat vraagt actie.", `<a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>`)}
    ${kpiGrid([
      { label: "Actieve loten", value: metrics.activeLiveEntries || 0, help: `${totals.total_entries || 0} loten totaal in de database.` },
      { label: "Deelnemers", value: totals.participating_customers || 0, help: `${percent(totals.free_entries || 0, totals.total_entries || 0)} via gratis deelname.` },
      { label: "Geschikte orders", value: percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0), help: `${orderTotals.eligible_orders || 0} orders vanaf €70.` },
      { label: "Omzet in app", value: formatEuro(orderTotals.gross_cents || 0), help: `${formatEuro(Math.round(orderTotals.avg_cents || 0))} gemiddelde orderwaarde.` }
    ])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Trend</p><h2>Lotvolume per maand</h2></div><span class="status status--active">${metrics.recentEntries} laatste 7 dagen</span></div>
        ${monthChart()}
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><div><p class="eyebrow">Actielijst</p><h2>Vandaag belangrijk</h2></div></div>
        <div class="stack">
          ${opsItems.map(([icon, title, body, badge]) => `<div class="ops-item"><span class="ops-icon">${icon}</span><span><strong>${escapeHtml(title)}</strong><br><span class="muted">${escapeHtml(body)}</span></span><span class="status">${escapeHtml(badge)}</span></div>`).join("")}
        </div>
      </div>
    </section>
    <section class="grid grid-2">
      ${breakdownPanel("Loten per bron", sourceRows, totals.total_entries || 0, "source")}
      ${breakdownPanel("Loten per status", statusRows, totals.total_entries || 0)}
    </section>
    <div class="section-head"><h2>Laatste winacties</h2><a class="button button--ghost" href="/admin/winacties">Alle winacties</a></div>
    <div class="panel">${drawTable(latestDraws)}</div>
  `));
});

adminRouter.get("/winacties", (req, res) => {
  const status = textParam(req.query.status);
  const q = textParam(req.query.q);
  const where = [];
  const params = [];
  if (status) {
    where.push("d.status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(d.title LIKE ? OR d.slug LIKE ? OR d.prize_name LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const draws = db.prepare(`
    SELECT d.*, COUNT(e.id) AS entry_count, we.entry_number AS winner_entry_number, wc.email AS winner_email
    FROM lottery_draws d
    LEFT JOIN lottery_entries e ON e.draw_id = d.id
    LEFT JOIN lottery_entries we ON we.id = d.winner_entry_id
    LEFT JOIN customers wc ON wc.id = we.customer_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY d.id
    ORDER BY d.created_at DESC
  `).all(...params);
  const rowsByStatus = db.prepare("SELECT status, COUNT(*) AS count FROM lottery_draws GROUP BY status ORDER BY count DESC").all();

  res.send(page("Winacties | Meat For Free", "winacties", `
    ${topbar("Winacties", "Beheer alle winacties.", "Maak acties aan, pas prijzen of timing aan, zet acties live en trek winnaars.", `<a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>`)}
    ${kpiGrid([
      { label: "Winacties", value: draws.length, help: "Binnen de huidige filters." },
      { label: "Live acties", value: rowsByStatus.find((row) => row.status === "LIVE")?.count || 0, help: "Actief zichtbaar voor klanten." },
      { label: "Getrokken", value: rowsByStatus.find((row) => row.status === "DRAWN")?.count || 0, help: "Acties met winnaar." },
      { label: "Concepten", value: rowsByStatus.find((row) => row.status === "DRAFT")?.count || 0, help: "Nog niet live." }
    ])}
    <section class="filters">
      <form method="get" action="/admin/winacties" class="filter-grid">
        <label class="wide">Zoek winactie<input name="q" value="${escapeHtml(q)}" placeholder="Titel, slug of prijs"></label>
        <label>Status<select name="status">${option("", status, "Alle statussen")}${drawStatuses.map((item) => option(item, status, statusLabel(item))).join("")}</select></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/winacties">Reset</a></div>
      </form>
    </section>
    <div class="panel">${drawTable(draws)}</div>
  `));
});

adminRouter.get("/winacties/:id", (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send(page("Niet gevonden", "winacties", topbar("Niet gevonden", "Winactie niet gevonden.", "", `<a class="button button--ghost" href="/admin/winacties">Terug</a>`)));
  const counts = db.prepare("SELECT status, COUNT(*) AS count FROM lottery_entries WHERE draw_id = ? GROUP BY status").all(draw.id);
  const entries = db.prepare(`
    SELECT e.entry_number, e.status, e.source, e.created_at, c.email, o.order_name
    FROM lottery_entries e
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.draw_id = ?
    ORDER BY e.created_at DESC
    LIMIT 40
  `).all(draw.id);

  res.send(page(`${draw.title} | Meat For Free`, "winacties", `
    ${topbar("Winactie bewerken", draw.title, "Pas inhoud, prijs, timing en status aan.", `<a class="button button--ghost" href="/admin/winacties">Terug</a><a class="button button--ghost" href="/admin/draws/${escapeHtml(draw.id)}/export.csv">Export CSV</a>`)}
    ${kpiGrid([
      { label: "Status", value: statusBadge(draw.status), help: "Huidige publicatiestatus." },
      { label: "Actieve loten", value: counts.find((row) => row.status === "ACTIVE")?.count || 0, help: "Geldige loten voor trekking." },
      { label: "Winnaars", value: counts.find((row) => row.status === "WINNER")?.count || 0, help: "Normaal 0 of 1." },
      { label: "Ongeldig", value: counts.find((row) => row.status === "VOID")?.count || 0, help: "Terugbetalingen en annuleringen." }
    ])}
    <section class="panel panel-pad">
      <div class="panel-title"><h2>Instellingen</h2></div>
      ${drawForm(draw, `/admin/winacties/${escapeHtml(draw.id)}/update`, "Wijzigingen opslaan")}
    </section>
    <div class="section-head"><h2>Recente loten</h2>${draw.status === "LIVE" ? `<form class="inline-form" method="post" action="/admin/draws/${escapeHtml(draw.id)}/draw"><button type="submit">Trek winnaar</button></form>` : ""}</div>
    <div class="panel">${entriesTable(entries)}</div>
  `));
});

adminRouter.get("/new-draw", (_req, res) => {
  res.send(page("Nieuwe winactie | Meat For Free", "nieuw", `
    ${topbar("Nieuwe winactie", "Maak een winactie aan.", "Zet hem eerst op concept of direct live wanneer alles klaar staat.", `<a class="button button--ghost" href="/admin/winacties">Terug</a>`)}
    <section class="panel panel-pad">${drawForm(null, "/admin/draws", "Winactie aanmaken")}</section>
  `));
});

adminRouter.post("/draws", urlencoded, async (req, res) => {
  await createDraw({
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
  res.redirect(`/admin/winacties/${draw.id}`);
});

adminRouter.get("/loten", (req, res) => {
  const filter = entryFilter(req);
  const entries = db.prepare(`
    SELECT e.entry_number, e.source, e.status, e.created_at, d.title AS draw_title, c.email, o.order_name
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

  res.send(page("Loten | Meat For Free", "loten", `
    ${topbar("Loten", "Controleer alle loten.", "Filter op klant, order, bron, status en periode.", `<a class="button button--ghost" href="/admin/loten">Reset</a>`)}
    ${entryFilters(filter.filter, "/admin/loten")}
    ${kpiGrid([{ label: "Gevonden loten", value: count, help: "Binnen actieve filters." }, { label: "Getoond", value: entries.length, help: "Maximaal 120 regels." }, { label: "Bronnen", value: entrySources.length, help: "Order, gratis, handmatig, abonnement." }, { label: "Export", value: "CSV", help: "Per winactie beschikbaar." }])}
    <div class="panel">${entriesTable(entries)}</div>
  `));
});

adminRouter.get("/orders", (req, res) => {
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

  res.send(page("Orders | Meat For Free", "orders", `
    ${topbar("Orders", "Orderkwaliteit en lottoekenning.", "Controleer of orders boven €70 correct loten krijgen.", `<form class="inline-form" method="post" action="/admin/reconcile"><button type="submit">Orders syncen</button></form>`)}
    <section class="filters">
      <form method="get" action="/admin/orders" class="filter-grid">
        <label class="wide">Zoek order of klant<input name="orderQ" value="${escapeHtml(filter.filter.orderQ)}" placeholder="#1001 of email"></label>
        <label>Status<select name="orderStatus">${option("", filter.filter.orderStatus, "Alle statussen")}${orderStatuses.map((row) => option(row.status, filter.filter.orderStatus, statusLabel(row.status))).join("")}</select></label>
        <label>Min. order €<input name="minTotal" inputmode="decimal" value="${escapeHtml(filter.filter.minTotal)}" placeholder="70"></label>
        <label>Max. order €<input name="maxTotal" inputmode="decimal" value="${escapeHtml(filter.filter.maxTotal)}" placeholder="250"></label>
        <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="/admin/orders">Reset</a></div>
      </form>
    </section>
    ${kpiGrid([{ label: "Orders", value: totals.count || 0, help: "Binnen actieve filters." }, { label: "Waarde", value: formatEuro(totals.total_cents || 0), help: "Orderwaarde in app database." }, { label: "Gemiddeld", value: formatEuro(Math.round(totals.avg_cents || 0)), help: "Gemiddelde orderwaarde." }, { label: "Getoond", value: orders.length, help: "Maximaal 120 regels." }])}
    <div class="panel">${ordersTable(orders)}</div>
  `));
});

adminRouter.get("/deelnemers", (_req, res) => {
  const customers = db.prepare(`
    SELECT c.*, COUNT(e.id) AS entry_count,
      SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN e.status = 'WINNER' THEN 1 ELSE 0 END) AS winner_count
    FROM customers c
    LEFT JOIN lottery_entries e ON e.customer_id = c.id
    GROUP BY c.id
    ORDER BY entry_count DESC, c.updated_at DESC
    LIMIT 120
  `).all();

  res.send(page("Deelnemers | Meat For Free", "deelnemers", `
    ${topbar("Deelnemers", "Klanten en deelnamewaarde.", "Zie wie de meeste loten heeft, wie actief is en waar winnaars zitten.", "")}
    ${kpiGrid([{ label: "Deelnemers", value: customers.length, help: "Top 120 zichtbaar." }, { label: "Actieve loten", value: customers.reduce((sum, row) => sum + Number(row.active_count || 0), 0), help: "Geldige deelname." }, { label: "Winnaars", value: customers.reduce((sum, row) => sum + Number(row.winner_count || 0), 0), help: "Historische winnaars." }, { label: "Shopify koppeling", value: customers.filter((row) => row.shopify_customer_id).length, help: "Met klant-ID." }])}
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
  const { totals, orderTotals } = metrics;
  const checks = [
    ["Gratis deelname aandeel", percent(totals.free_entries || 0, totals.total_entries || 0), totals.free_entries || 0, totals.total_entries || 0],
    ["Ongeldige loten", percent(totals.void_entries || 0, totals.total_entries || 0), totals.void_entries || 0, totals.total_entries || 0],
    ["Geschikte orders zonder lot", String(metrics.eligibleWithoutEntry), metrics.eligibleWithoutEntry, Math.max(metrics.eligibleWithoutEntry, orderTotals.eligible_orders || 0)],
    ["Live acties zonder loten", String(metrics.liveDrawsWithoutEntries), metrics.liveDrawsWithoutEntries, Math.max(metrics.liveDrawsWithoutEntries, metrics.liveDraws || 0)]
  ];

  res.send(page("Compliance | Meat For Free", "compliance", `
    ${topbar("Compliance", "Eerlijke deelname aantoonbaar houden.", "Deze pagina is voor gratis deelname, refunds, eligible orders en auditchecks.", "")}
    ${kpiGrid([{ label: "Gratis deelnames", value: totals.free_entries || 0, help: "Aparte deelname zonder aankoop." }, { label: "Ongeldige loten", value: totals.void_entries || 0, help: "Terugbetalingen en annuleringen." }, { label: "Geschikt zonder lot", value: metrics.eligibleWithoutEntry, help: "Moet richting 0 blijven." }, { label: "Orderdekking", value: percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0), help: "Orders boven €70." }])}
    <section class="grid grid-2">
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Auditratio's</h2></div>
        <div class="stack">${checks.map(([label, value, part, total]) => `<div class="metric-row"><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div><div class="bar"><span style="width:${ratio(part, total)}%"></span></div></div>`).join("")}</div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title"><h2>Professionele verbeteringen</h2></div>
        <div class="stack">
          <div class="ops-item"><span class="ops-icon">1</span><span><strong>Auditlog per trekking</strong><br><span class="muted">Volgende logische stap: wie trok winnaar, wanneer, met welke pool.</span></span><span class="status">Aanrader</span></div>
          <div class="ops-item"><span class="ops-icon">2</span><span><strong>Instelbare lotregels</strong><br><span class="muted">€70-grens later via admin beheren in plaats van code/config.</span></span><span class="status">Schaalbaar</span></div>
          <div class="ops-item"><span class="ops-icon">3</span><span><strong>Fraudechecks</strong><br><span class="muted">Dubbele gratis deelnames, emaildomeinen en verdachte patronen markeren.</span></span><span class="status">Later</span></div>
        </div>
      </div>
    </section>
  `));
});

adminRouter.get("/sync", (_req, res) => {
  const metrics = getMetrics();
  res.send(page("Synchronisatie | Meat For Free", "sync", `
    ${topbar("Synchronisatie", "Systeemacties voor datakwaliteit.", "Gebruik deze pagina als Shopify data, klantdashboards of loten niet gelijk lopen.", "")}
    ${kpiGrid([{ label: "Geschikt zonder lot", value: metrics.eligibleWithoutEntry, help: "Na ordersynchronisatie moet dit dalen." }, { label: "Live loten", value: metrics.activeLiveEntries, help: "Beschikbaar in live acties." }, { label: "Laatste 7 dagen", value: metrics.recentEntries, help: "Nieuwe lotactiviteit." }, { label: "Vandaag orders", value: metrics.todayOrders, help: "Vandaag verwerkt." }])}
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
  res.send(page("Embed | Meat For Free", "embed", `
    ${topbar("Embed voorbeeld", "Controleer de Shopify embed.", "Gebruik deze pagina om de klant-facing widget snel te openen.", `<a class="button button--gold" href="/embed/demo">Open embed demo</a>`)}
    <section class="panel panel-pad"><h2>Embed URL</h2><p class="helper">Plaats deze in Shopify waar de app wordt ingeladen.</p><input readonly value="https://dvl-lottery-app.onrender.com/embed/dvl-lottery.js" onclick="this.select()"></section>
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
    await drawWinner(req.params.id);
    res.redirect(`/admin/winacties/${req.params.id}`);
  } catch (error) {
    res.status(400).send(page("Trekking fout", "winacties", topbar("Actie gestopt", "Kan geen winnaar trekken.", error.message, `<a class="button button--gold" href="/admin/winacties/${escapeHtml(req.params.id)}">Terug</a>`)));
  }
});

adminRouter.post("/reconcile", async (_req, res) => {
  await reconcileActiveOrderEntries();
  res.redirect("/admin/sync");
});

adminRouter.post("/sync-dashboards", async (_req, res) => {
  await syncAllCustomerDashboardMetafields();
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

function entryFilters(filter, action) {
  return `<section class="filters">
    <form method="get" action="${action}" class="filter-grid">
      <label class="wide">Zoek lot, klant, order of winactie<input name="q" value="${escapeHtml(filter.q)}" placeholder="Email, lotnummer, ordernummer"></label>
      <label>Lotstatus<select name="entryStatus">${option("", filter.entryStatus, "Alle lotstatussen")}${entryStatuses.map((status) => option(status, filter.entryStatus, statusLabel(status))).join("")}</select></label>
      <label>Bron<select name="source">${option("", filter.source, "Alle bronnen")}${entrySources.map((source) => option(source, filter.source, statusLabel(source))).join("")}</select></label>
      <label>Winactie status<select name="drawStatus">${option("", filter.drawStatus, "Alle winacties")}${drawStatuses.map((status) => option(status, filter.drawStatus, statusLabel(status))).join("")}</select></label>
      <label>Vanaf<input type="date" name="from" value="${escapeHtml(filter.from)}"></label>
      <label>Tot<input type="date" name="to" value="${escapeHtml(filter.to)}"></label>
      <div class="actions"><button type="submit">Filter</button><a class="button button--ghost" href="${action}">Reset</a></div>
    </form>
  </section>`;
}

function entriesTable(entries) {
  return `<table>
    <thead><tr><th>Lot</th><th>Bron</th><th>Klant</th><th>Winactie</th><th>Status</th><th>Datum</th></tr></thead>
    <tbody>${entries.length ? entries.map((entry) => `<tr>
      <td><strong>${escapeHtml(entry.entry_number)}</strong><span class="muted">${escapeHtml(entry.order_name || "-")}</span></td>
      <td>${escapeHtml(statusLabel(entry.source))}</td>
      <td>${escapeHtml(entry.email || "-")}</td>
      <td>${escapeHtml(entry.draw_title || "-")}</td>
      <td>${statusBadge(entry.status)}</td>
      <td>${escapeHtml(entry.created_at)}</td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen loten gevonden.</div></td></tr>`}</tbody>
  </table>`;
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
