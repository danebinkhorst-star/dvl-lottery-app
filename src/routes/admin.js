import express from "express";
import { db } from "../db.js";
import { createDraw, drawWinner } from "../services/lottery.js";
import { syncAllCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { formatEuro } from "../utils.js";

export const adminRouter = express.Router();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  return `<span class="status status--${escapeHtml(normalized)}">${escapeHtml(status || "-")}</span>`;
}

function csv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function textParam(value) {
  return String(value || "").trim();
}

function moneyParamToCents(value) {
  const raw = textParam(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function isoDateParam(value) {
  const raw = textParam(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function option(value, current, label) {
  return `<option value="${escapeHtml(value)}"${String(current || "") === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function percent(part, total) {
  if (!total) return "0%";
  return `${Math.round((Number(part || 0) / Number(total || 0)) * 100)}%`;
}

function safeDivide(part, total, decimals = 1) {
  if (!total) return "0";
  return (Number(part || 0) / Number(total || 0)).toFixed(decimals);
}

function barWidth(part, total) {
  if (!total) return 0;
  return Math.max(4, Math.min(100, Math.round((Number(part || 0) / Number(total || 0)) * 100)));
}

function buildEntryFilter(req) {
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
    where.push(`(e.entry_number LIKE ? OR c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR o.order_name LIKE ? OR d.title LIKE ?)`);
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

function buildOrderFilter(req) {
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

function page(title, body) {
  return `<!doctype html>
  <html lang="nl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Manrope:wght@500;700;800;900&display=swap" rel="stylesheet">
      <style>
        :root {
          --cream:#fff4dd;
          --cream-2:#f6dfb7;
          --paper:#fffaf0;
          --ink:#21150f;
          --red:#a33127;
          --red-deep:#792119;
          --gold:#d2a947;
          --mustard:#f0bf39;
          --sage:#3d4a2c;
          --line:#24170f;
          --dark:#120d09;
          --shadow: 0 18px 0 rgba(33, 21, 15, .16);
        }
        * { box-sizing: border-box; }
        html { background: var(--dark); }
        body {
          min-height: 100vh;
          margin: 0;
          color: var(--ink);
          background: #f2eadc;
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-weight: 700;
        }
        body::before {
          content:"";
          position: fixed;
          inset: 0;
          pointer-events: none;
          opacity: .12;
          background-image: linear-gradient(45deg, var(--line) 1px, transparent 1px);
          background-size: 18px 18px;
          mix-blend-mode: multiply;
        }
        .app-shell {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 278px minmax(0, 1fr);
        }
        .sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          padding: 24px 18px;
          border-right: 3px solid var(--line);
          background:
            linear-gradient(180deg, #18261e 0%, #10140f 100%);
          color: var(--cream);
        }
        .sidebar-brand {
          display:flex;
          align-items:center;
          gap:12px;
          margin-bottom: 28px;
          color: inherit;
          text-decoration:none;
        }
        .sidebar-mark {
          width:44px;
          height:44px;
          display:grid;
          place-items:center;
          border:2px solid rgba(255, 244, 221, .36);
          border-radius: 14px 6px 14px 6px;
          background: var(--red);
          color: var(--cream);
          box-shadow: 4px 4px 0 var(--gold);
          font-family:"Archivo Black", Impact, sans-serif;
          font-size: 16px;
        }
        .sidebar-brand strong {
          display:block;
          font-family:"Archivo Black", Impact, sans-serif;
          font-size: 20px;
          line-height:.88;
          text-transform: uppercase;
        }
        .sidebar-brand span span {
          display:block;
          margin-top:5px;
          color: rgba(255, 244, 221, .62);
          font-size:10px;
          font-weight:950;
          letter-spacing:.12em;
          text-transform: uppercase;
        }
        .menu-group {
          margin: 22px 0 0;
        }
        .menu-title {
          margin: 0 0 8px;
          color: rgba(255, 244, 221, .54);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .menu-link {
          min-height: 42px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap: 12px;
          padding: 9px 10px;
          border: 2px solid transparent;
          border-radius: 14px 6px 14px 6px;
          color: rgba(255, 244, 221, .82);
          text-decoration:none;
          font-size: 13px;
          font-weight: 900;
        }
        .menu-link:hover,
        .menu-link:focus-visible,
        .menu-link--active {
          border-color: rgba(255, 244, 221, .24);
          background: rgba(255, 244, 221, .09);
          color: var(--cream);
          outline: none;
        }
        .menu-left {
          display:flex;
          align-items:center;
          gap: 10px;
        }
        .menu-icon {
          width: 25px;
          height: 25px;
          display:grid;
          place-items:center;
          border: 2px solid rgba(255, 244, 221, .22);
          border-radius: 9px 4px 9px 4px;
          color: var(--mustard);
          font-size: 10px;
          font-weight: 950;
        }
        .menu-count {
          min-width: 24px;
          height: 24px;
          display:grid;
          place-items:center;
          border-radius: 999px;
          background: var(--mustard);
          color: var(--ink);
          font-size: 11px;
          font-weight: 950;
        }
        .content-shell {
          min-width: 0;
          display:flex;
          flex-direction:column;
        }
        .announce {
          min-height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 9px 18px;
          border-bottom: 3px solid var(--line);
          background: var(--red);
          color: var(--cream);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .09em;
          text-align: center;
          text-transform: uppercase;
        }
        header {
          position: sticky;
          top: 0;
          z-index: 10;
          min-height: 74px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 14px clamp(16px, 3vw, 32px);
          border-bottom: 3px solid var(--line);
          background: rgba(255, 250, 240, .94);
          backdrop-filter: blur(16px);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 13px;
          color: inherit;
          text-decoration: none;
        }
        .brand-mark {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          border: 3px solid var(--line);
          border-radius: 18px 8px 18px 8px;
          background: var(--red);
          color: var(--cream);
          box-shadow: 5px 5px 0 var(--gold);
          font-family: "Archivo Black", Impact, sans-serif;
          font-size: 19px;
        }
        .brand strong {
          display: block;
          font-family: "Archivo Black", Impact, sans-serif;
          font-size: clamp(20px, 2.2vw, 34px);
          line-height: .85;
          letter-spacing: -.02em;
          text-transform: uppercase;
        }
        .brand span span {
          display: block;
          margin-top: 5px;
          color: #6f5540;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 10px;
        }
        .top-tools {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          flex-wrap:wrap;
          gap: 10px;
        }
        .search-pill {
          min-width: min(360px, 32vw);
          min-height: 44px;
          display:flex;
          align-items:center;
          gap: 10px;
          padding: 0 16px;
          border: 3px solid var(--line);
          border-radius: 999px;
          background: #fffdf6;
          color: #6f5540;
          font-size: 13px;
          font-weight: 900;
        }
        .tool-chip {
          min-height: 44px;
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 0 14px;
          border: 3px solid var(--line);
          border-radius: 999px;
          background: var(--paper);
          color: var(--ink);
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
          text-decoration:none;
        }
        main {
          position: relative;
          width: min(100%, 1480px);
          margin: 0 auto;
          padding: clamp(24px, 4vw, 58px) clamp(14px, 3vw, 34px) 72px;
        }
        h1, h2, h3 {
          margin: 0;
          font-family: "Archivo Black", Impact, sans-serif;
          line-height: .86;
          letter-spacing: -.03em;
          text-transform: uppercase;
        }
        h1 {
          max-width: 920px;
          font-size: clamp(48px, 7.8vw, 128px);
          overflow-wrap: break-word;
          text-wrap: balance;
        }
        h2 { font-size: clamp(30px, 4vw, 62px); }
        .eyebrow {
          width: fit-content;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin: 0 0 14px;
          padding: 10px 15px;
          border: 3px solid var(--line);
          border-radius: 999px;
          background: var(--mustard);
          box-shadow: 5px 5px 0 var(--line);
          font-size: 12px;
          font-weight: 950;
          line-height: 1;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .eyebrow::before {
          content:"";
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--red);
          box-shadow: 0 0 0 4px rgba(163, 49, 39, .16);
        }
        .topbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          gap: 22px;
          margin-bottom: clamp(24px, 4vw, 46px);
        }
        .hero-copy {
          position: relative;
          padding: clamp(20px, 3vw, 36px);
          overflow: hidden;
          border: 3px solid var(--line);
          border-radius: 44px 18px 44px 18px;
          background: rgba(255, 250, 240, .82);
          box-shadow: var(--shadow);
        }
        .hero-copy::after {
          content:"FREE";
          position:absolute;
          right: -10px;
          bottom: -10px;
          color: rgba(163, 49, 39, .08);
          font-family: "Archivo Black", Impact, sans-serif;
          font-size: clamp(76px, 12vw, 180px);
          line-height: .7;
          pointer-events:none;
        }
        .muted {
          color: #6f5540;
          font-weight: 800;
        }
        .button, button {
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 0 22px;
          border: 3px solid var(--line);
          border-radius: 999px;
          background: var(--red);
          color: var(--cream);
          box-shadow: 5px 5px 0 var(--line);
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 950;
          line-height: 1;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          transform: translate(0, 0);
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }
        .button:hover, button:hover,
        .button:focus-visible, button:focus-visible {
          background: var(--red-deep);
          transform: translate(3px, 3px);
          box-shadow: 2px 2px 0 var(--line);
          outline: none;
        }
        .button--gold { background: var(--mustard); color: var(--ink); }
        .button--gold:hover, .button--gold:focus-visible { background: var(--gold); }
        .button--ghost { background: var(--paper); color: var(--ink); }
        .grid {
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: clamp(12px, 1.8vw, 20px);
          margin-bottom: clamp(34px, 5vw, 62px);
        }
        .grid > *,
        .insight-grid > *,
        .split-panels > * {
          min-width: 0;
        }
        .card {
          position: relative;
          min-height: 174px;
          padding: 25px;
          overflow: hidden;
          border: 3px solid var(--line);
          border-radius: 30px 12px 30px 12px;
          background: var(--paper);
          box-shadow: 8px 8px 0 rgba(33, 21, 15, .18);
        }
        .card:nth-child(2) { background: var(--mustard); }
        .card:nth-child(3) { background: #f7dca7; }
        .card--blue { background:#3f7df2; color:#fffdf6; }
        .card--teal { background:#0fb5bf; color:#fffdf6; }
        .card--green { background:#4aaf50; color:#fffdf6; }
        .card--dark { background:#172019; color:#fffdf6; }
        .card--blue .muted,
        .card--teal .muted,
        .card--green .muted,
        .card--dark .muted,
        .card--blue .stat,
        .card--teal .stat,
        .card--green .stat,
        .card--dark .stat {
          color: inherit;
        }
        .card p { margin: 0; }
        .card .muted {
          color: var(--ink);
          font-size: 12px;
          letter-spacing: .1em;
          text-transform: uppercase;
        }
        .stat {
          margin-top: 18px;
          color: var(--red);
          font-family: "Archivo Black", Impact, sans-serif;
          font-size: clamp(46px, 6vw, 82px);
          line-height: .78;
          letter-spacing: -.05em;
        }
        .card:nth-child(2) .stat { color: var(--ink); }
        .card::after {
          content:"";
          position:absolute;
          right: -28px;
          bottom: -28px;
          width: 94px;
          height: 94px;
          border: 16px solid rgba(33, 21, 15, .08);
          border-radius: 50%;
        }
        .section-head {
          display:flex;
          justify-content:space-between;
          align-items:flex-end;
          gap:18px;
          margin: clamp(26px, 5vw, 54px) 0 16px;
        }
        .panel {
          max-width: 100%;
          overflow: hidden;
          border: 3px solid var(--line);
          border-radius: 34px 14px 34px 14px;
          background: rgba(255, 250, 240, .9);
          box-shadow: 10px 10px 0 rgba(33, 21, 15, .14);
        }
        .filters {
          margin: 0 0 clamp(28px, 4vw, 46px);
          padding: clamp(16px, 2.6vw, 28px);
          border: 3px solid var(--line);
          border-radius: 30px 12px 30px 12px;
          background: rgba(255, 250, 240, .92);
          box-shadow: 8px 8px 0 rgba(33, 21, 15, .14);
        }
        .filters h2 {
          margin-bottom: 18px;
          font-size: clamp(24px, 3vw, 42px);
        }
        .filter-grid {
          display:grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 12px;
          align-items:end;
        }
        .filter-grid label {
          margin: 0;
        }
        .filter-grid .wide {
          grid-column: span 2;
        }
        .filter-actions {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          align-items:center;
        }
        .insight-grid {
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: clamp(34px, 5vw, 62px);
        }
        .insight {
          padding: 18px;
          border: 2px solid rgba(36, 23, 15, .22);
          border-radius: 22px 10px 22px 10px;
          background: rgba(255, 250, 240, .74);
        }
        .insight span {
          display:block;
          color:#6f5540;
          font-size: 11px;
          font-weight: 950;
          letter-spacing:.08em;
          text-transform:uppercase;
        }
        .insight strong {
          display:block;
          margin-top: 10px;
          color: var(--red);
          font-family: "Archivo Black", Impact, sans-serif;
          font-size: clamp(24px, 3vw, 42px);
          line-height: .9;
          letter-spacing: -.03em;
        }
        .split-panels {
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: clamp(14px, 2vw, 22px);
          margin-bottom: clamp(30px, 5vw, 58px);
        }
        .compact-table td,
        .compact-table th {
          padding: 13px 14px;
        }
        .bar {
          height: 12px;
          overflow:hidden;
          border: 2px solid var(--line);
          border-radius: 999px;
          background: #fffdf6;
        }
        .bar span {
          display:block;
          height:100%;
          background: var(--red);
        }
        .ops-grid {
          display:grid;
          grid-template-columns: minmax(0, 1.3fr) minmax(320px, .7fr);
          gap: clamp(14px, 2vw, 22px);
          margin-bottom: clamp(30px, 5vw, 58px);
        }
        .panel-pad {
          padding: clamp(16px, 2.4vw, 26px);
        }
        .panel-title {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom: 18px;
        }
        .panel-title h2 {
          font-size: clamp(24px, 3vw, 42px);
        }
        .ops-list {
          display:grid;
          gap: 12px;
        }
        .ops-item {
          display:grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items:center;
          gap: 14px;
          padding: 14px;
          border: 2px solid rgba(36, 23, 15, .18);
          border-radius: 18px 8px 18px 8px;
          background: rgba(255, 253, 246, .78);
        }
        .ops-icon {
          width: 42px;
          height: 42px;
          display:grid;
          place-items:center;
          border: 3px solid var(--line);
          border-radius: 14px 6px 14px 6px;
          background: var(--mustard);
          font-weight: 950;
        }
        .ops-item strong {
          display:block;
          font-size: 15px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .ops-item span {
          display:block;
          margin-top: 3px;
          color:#6f5540;
          font-size: 12px;
          font-weight: 850;
        }
        .mini-chart {
          display:grid;
          grid-template-columns: repeat(12, minmax(10px, 1fr));
          align-items:end;
          gap: 8px;
          height: 176px;
          padding: 18px;
          border: 2px solid rgba(36, 23, 15, .18);
          border-radius: 22px 10px 22px 10px;
          background: linear-gradient(180deg, rgba(240, 191, 57, .12), rgba(255, 253, 246, .7));
        }
        .mini-chart span {
          min-height: 6px;
          border: 2px solid var(--line);
          border-radius: 999px 999px 4px 4px;
          background: var(--red);
        }
        .ratio-stack {
          display:grid;
          gap: 14px;
        }
        .ratio-row {
          display:grid;
          gap: 7px;
        }
        .ratio-row > div:first-child {
          display:flex;
          justify-content:space-between;
          gap: 12px;
          color:#5c4534;
          font-size: 12px;
          font-weight: 950;
          letter-spacing:.06em;
          text-transform: uppercase;
        }
        table {
          width:100%;
          border-collapse: collapse;
          background: transparent;
        }
        th, td {
          padding: 17px 18px;
          border-bottom: 2px solid rgba(36, 23, 15, .12);
          text-align:left;
          vertical-align:middle;
        }
        th {
          background: var(--dark);
          color: var(--cream);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .12em;
          text-transform: uppercase;
        }
        td strong {
          display:block;
          font-size: 17px;
          font-weight: 950;
          text-transform: uppercase;
        }
        tbody tr:hover { background: rgba(240, 191, 57, .12); }
        .status {
          min-width: 78px;
          display:inline-flex;
          justify-content:center;
          padding: 9px 12px;
          border: 2px solid var(--line);
          border-radius: 999px;
          background: var(--paper);
          color: var(--ink);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .status--live, .status--active, .status--paid { background: var(--sage); color: var(--cream); }
        .status--drawn, .status--winner { background: var(--mustard); color: var(--ink); }
        .status--void, .status--cancelled, .status--refunded { background: var(--red); color: var(--cream); }
        form:not(.inline-form) {
          max-width: 760px;
          padding: clamp(18px, 3vw, 34px);
          border: 3px solid var(--line);
          border-radius: 38px 14px 38px 14px;
          background: var(--paper);
          box-shadow: var(--shadow);
        }
        .inline-form {
          padding: 0;
          margin: 0;
          border: 0;
          background: transparent;
        }
        label {
          display:block;
          margin-bottom: 14px;
          color:#5c4534;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        input, textarea, select {
          width:100%;
          min-height: 50px;
          margin: 8px 0 0;
          padding: 13px 15px;
          border: 3px solid var(--line);
          border-radius: 18px;
          background: #fffdf6;
          color: var(--ink);
          font: inherit;
          font-weight: 800;
        }
        input:focus, textarea:focus, select:focus {
          outline: 4px solid rgba(210, 169, 71, .38);
        }
        .form-actions {
          display:flex;
          flex-wrap:wrap;
          gap:12px;
          margin-top: 22px;
        }
        .empty {
          padding: 28px;
          color:#6f5540;
          font-weight: 850;
        }

        /* Admin clarity pass: keep brand accents, prioritize scan speed and scale. */
        :root {
          --cream:#f9fafb;
          --cream-2:#eef2f7;
          --paper:#ffffff;
          --ink:#111827;
          --red:#b42318;
          --red-deep:#8a1c13;
          --gold:#d39a17;
          --mustard:#f5c451;
          --sage:#157347;
          --line:#d8dee8;
          --dark:#111827;
          --muted:#6b7280;
          --soft:#f3f5f8;
          --shadow: 0 10px 26px rgba(17, 24, 39, .08);
        }
        html { background: var(--soft); }
        body {
          color: var(--ink);
          background: var(--soft);
          font-weight: 600;
        }
        body::before { display:none; }
        .app-shell {
          grid-template-columns: 260px minmax(0, 1fr);
        }
        .sidebar {
          padding: 20px 14px;
          border-right: 1px solid #1f2937;
          background: #111827;
          color: #f9fafb;
        }
        .sidebar-brand {
          gap: 10px;
          margin-bottom: 24px;
          padding: 0 6px;
        }
        .sidebar-mark,
        .brand-mark {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 8px;
          background: var(--red);
          box-shadow: none;
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 900;
        }
        .sidebar-brand strong,
        .brand strong {
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-size: 17px;
          line-height: 1.02;
          letter-spacing: 0;
        }
        .sidebar-brand span span,
        .brand span span {
          color: rgba(249, 250, 251, .58);
          font-size: 10px;
          letter-spacing: .08em;
        }
        .brand span span { color: var(--muted); }
        .menu-group { margin: 22px 0 0; }
        .menu-title {
          margin-left: 8px;
          color: rgba(249, 250, 251, .48);
          font-size: 10px;
          letter-spacing: .1em;
        }
        .menu-link {
          min-height: 38px;
          padding: 8px 10px;
          border: 0;
          border-radius: 8px;
          color: rgba(249, 250, 251, .74);
          font-size: 13px;
          font-weight: 750;
        }
        .menu-link:hover,
        .menu-link:focus-visible,
        .menu-link--active {
          background: rgba(255, 255, 255, .08);
          color: #fff;
        }
        .menu-icon {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 7px;
          background: rgba(255, 255, 255, .08);
          color: #f5c451;
          font-size: 9px;
        }
        .menu-count {
          background: var(--gold);
          font-size: 10px;
        }
        .announce { display:none; }
        header {
          min-height: 64px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, .94);
          box-shadow: 0 1px 0 rgba(17, 24, 39, .04);
        }
        .brand { gap: 10px; }
        .top-tools { gap: 8px; }
        .search-pill,
        .tool-chip {
          min-height: 38px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #fff;
          color: var(--muted);
          font-size: 12px;
          font-weight: 750;
          text-transform: none;
        }
        main {
          width: min(100%, 1440px);
          padding: 26px clamp(18px, 3vw, 34px) 56px;
        }
        h1, h2, h3 {
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          line-height: 1.05;
          letter-spacing: 0;
          text-transform: none;
        }
        h1 {
          max-width: 760px;
          font-size: clamp(32px, 4vw, 48px);
          font-weight: 900;
        }
        h2 {
          font-size: clamp(20px, 2vw, 28px);
          font-weight: 900;
        }
        .eyebrow {
          margin-bottom: 8px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          color: var(--red);
          font-size: 11px;
          letter-spacing: .08em;
        }
        .eyebrow::before { display:none; }
        .topbar {
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }
        .hero-copy {
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .hero-copy::after { display:none; }
        .muted { color: var(--muted); font-weight: 650; }
        .button, button {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid var(--red);
          border-radius: 8px;
          background: var(--red);
          color: #fff;
          box-shadow: none;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: none;
          transition: background 160ms ease, border-color 160ms ease;
        }
        .button:hover, button:hover,
        .button:focus-visible, button:focus-visible {
          background: var(--red-deep);
          border-color: var(--red-deep);
          transform: none;
          box-shadow: none;
        }
        .button--gold {
          background: #fff7db;
          border-color: #e7c76f;
          color: #5b3b00;
        }
        .button--gold:hover,
        .button--gold:focus-visible {
          background: #ffefb6;
          border-color: #d39a17;
        }
        .button--ghost {
          background: #fff;
          border-color: var(--line);
          color: var(--ink);
        }
        .grid,
        .insight-grid,
        .split-panels,
        .ops-grid {
          gap: 16px;
          margin-bottom: 24px;
        }
        .card,
        .insight,
        .panel,
        .filters {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          box-shadow: none;
        }
        .card {
          min-height: 128px;
          padding: 18px;
          border-top: 3px solid var(--red);
        }
        .card:nth-child(2),
        .card:nth-child(3),
        .card--blue,
        .card--teal,
        .card--green,
        .card--dark {
          background: #fff;
          color: var(--ink);
        }
        .card--teal { border-top-color:#0ea5a9; }
        .card--green { border-top-color:#16a34a; }
        .card--dark { border-top-color:#111827; }
        .card .muted,
        .card--blue .muted,
        .card--teal .muted,
        .card--green .muted,
        .card--dark .muted {
          color: var(--muted);
          font-size: 12px;
          letter-spacing: .04em;
        }
        .stat,
        .card:nth-child(2) .stat,
        .card--blue .stat,
        .card--teal .stat,
        .card--green .stat,
        .card--dark .stat {
          margin-top: 12px;
          color: var(--ink);
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-size: clamp(28px, 3.5vw, 42px);
          line-height: 1;
          letter-spacing: 0;
        }
        .card::after { display:none; }
        .section-head {
          margin: 30px 0 12px;
          align-items:center;
        }
        .filters {
          padding: 18px;
        }
        .filters h2,
        .panel-title h2 {
          margin-bottom: 12px;
          font-size: clamp(20px, 2vw, 26px);
        }
        .filter-grid {
          gap: 12px;
        }
        .insight {
          padding: 16px;
        }
        .insight span {
          color: var(--muted);
          font-size: 11px;
          letter-spacing: .04em;
        }
        .insight strong {
          margin-top: 8px;
          color: var(--ink);
          font-family: Manrope, ui-sans-serif, system-ui, sans-serif;
          font-size: clamp(22px, 2vw, 30px);
          line-height: 1;
          letter-spacing: 0;
        }
        .panel-pad {
          padding: 18px;
        }
        .panel-title {
          margin-bottom: 14px;
        }
        .ops-item {
          gap: 12px;
          padding: 12px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #fff;
        }
        .ops-icon {
          width: 34px;
          height: 34px;
          border: 0;
          border-radius: 8px;
          background: #fff4d6;
          color: #704900;
          font-size: 11px;
        }
        .ops-item strong {
          font-size: 13px;
          font-weight: 850;
          text-transform: none;
        }
        .ops-item span {
          color: var(--muted);
          font-size: 12px;
          font-weight: 650;
        }
        .mini-chart {
          height: 160px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #f8fafc;
        }
        .mini-chart span {
          border: 0;
          border-radius: 6px 6px 2px 2px;
          background: #b42318;
        }
        .bar {
          height: 8px;
          border: 0;
          background: #e5e7eb;
        }
        .bar span {
          background: #b42318;
        }
        .ratio-row > div:first-child {
          color: var(--muted);
          font-size: 12px;
          letter-spacing: .03em;
        }
        th, td {
          padding: 12px 14px;
          border-bottom: 1px solid #eef0f4;
          font-size: 13px;
        }
        th {
          background: #f8fafc;
          color: #4b5563;
          font-size: 11px;
          letter-spacing: .05em;
        }
        td strong {
          font-size: 14px;
          font-weight: 850;
          text-transform: none;
        }
        tbody tr:hover { background: #faf7f2; }
        .status {
          min-width: 0;
          padding: 5px 9px;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: #f8fafc;
          color: #374151;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: none;
        }
        .status--live,
        .status--active,
        .status--paid {
          background: #ecfdf3;
          border-color: #bbf7d0;
          color: #166534;
        }
        .status--drawn,
        .status--winner {
          background: #fff7db;
          border-color: #fde68a;
          color: #7a4b00;
        }
        .status--void,
        .status--cancelled,
        .status--refunded {
          background: #fef3f2;
          border-color: #fecaca;
          color: #991b1b;
        }
        form:not(.inline-form) {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          box-shadow: none;
        }
        label {
          color: #4b5563;
          font-size: 11px;
          letter-spacing: .04em;
        }
        input, textarea, select {
          min-height: 40px;
          margin-top: 6px;
          padding: 9px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #fff;
          font-size: 13px;
          font-weight: 650;
        }
        input:focus, textarea:focus, select:focus {
          outline: 3px solid rgba(180, 35, 24, .12);
          border-color: var(--red);
        }
        @media (max-width: 1200px) {
          .grid,
          .insight-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .search-pill {
            min-width: min(280px, 30vw);
          }
        }
        @media (max-width: 900px) {
          .app-shell { grid-template-columns: 1fr; }
          .sidebar {
            position: relative;
            height: auto;
            display: block;
            padding: 16px;
            border-right: 0;
            border-bottom: 3px solid var(--line);
          }
          .menu-group {
            display:grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
            margin-top: 14px;
          }
          .menu-title { grid-column: 1 / -1; }
          header { border-radius: 0 0 28px 28px; align-items:flex-start; }
          .topbar { grid-template-columns: 1fr; align-items:start; }
          .grid, .insight-grid, .split-panels, .ops-grid { grid-template-columns: 1fr; }
          .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .filter-grid .wide { grid-column: span 2; }
          .section-head { display:block; }
          .panel { overflow-x:auto; }
          table { min-width: 760px; }
        }
        @media (max-width: 560px) {
          .announce { font-size: 10px; }
          header { padding: 14px; gap: 10px; align-items:stretch; flex-direction:column; }
          .top-tools { justify-content:flex-start; }
          .search-pill { min-width: 100%; }
          .brand-mark { width: 44px; height:44px; }
          nav .button { min-height: 42px; padding: 0 14px; font-size: 11px; }
          main { padding-inline: 10px; }
          .hero-copy { border-radius: 30px 12px 30px 12px; }
          h1 { font-size: clamp(34px, 10vw, 40px); line-height: .9; }
        }
      </style>
    </head>
    <body>
      <div class="app-shell">
        <aside class="sidebar" aria-label="Meat For Free admin menu">
          <a class="sidebar-brand" href="/admin" aria-label="Meat For Free dashboard">
            <span class="sidebar-mark">MFF</span>
            <span><strong>Meat For<br>Free</strong><span>Control room</span></span>
          </a>
          <div class="menu-group">
            <p class="menu-title">Run vandaag</p>
            <a class="menu-link menu-link--active" href="/admin#overview"><span class="menu-left"><span class="menu-icon">OV</span>Overview</span><span class="menu-count">1</span></a>
            <a class="menu-link" href="/admin#winacties"><span class="menu-left"><span class="menu-icon">WA</span>Winacties</span></a>
            <a class="menu-link" href="/admin#lotactiviteit"><span class="menu-left"><span class="menu-icon">LT</span>Loten</span></a>
            <a class="menu-link" href="/admin#orders"><span class="menu-left"><span class="menu-icon">OR</span>Orders</span></a>
          </div>
          <div class="menu-group">
            <p class="menu-title">Controle</p>
            <a class="menu-link" href="/admin#deelnemers"><span class="menu-left"><span class="menu-icon">KL</span>Deelnemers</span></a>
            <a class="menu-link" href="/admin#compliance"><span class="menu-left"><span class="menu-icon">CP</span>Compliance</span></a>
            <a class="menu-link" href="/admin#sync"><span class="menu-left"><span class="menu-icon">SY</span>Sync jobs</span></a>
            <a class="menu-link" href="/api/draws/live"><span class="menu-left"><span class="menu-icon">API</span>Live API</span></a>
          </div>
          <div class="menu-group">
            <p class="menu-title">Acties</p>
            <a class="menu-link" href="/admin/new-draw"><span class="menu-left"><span class="menu-icon">+</span>Nieuwe winactie</span></a>
            <a class="menu-link" href="/embed/demo"><span class="menu-left"><span class="menu-icon">EM</span>Embed preview</span></a>
          </div>
        </aside>
        <div class="content-shell">
          <div class="announce">Meat For Free control room · loten bij €70 · live trekkingen · eerlijke winnaars</div>
          <header>
            <a class="brand" href="/admin" aria-label="Meat For Free dashboard">
              <span class="brand-mark">MFF</span>
              <span><strong>Meat For<br>Free</strong><span>Lottery app</span></span>
            </a>
            <div class="top-tools">
              <a class="search-pill" href="/admin#filters">Search orders, loten, klanten</a>
              <a class="tool-chip" href="/api/draws/live">Live API</a>
              <a class="tool-chip" href="/embed/demo">Embed</a>
            </div>
          </header>
          <main>${body}</main>
        </div>
      </div>
    </body>
  </html>`;
}

adminRouter.get("/", async (req, res) => {
  const entryFilter = buildEntryFilter(req);
  const orderFilter = buildOrderFilter(req);
  const draws = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM lottery_entries e WHERE e.draw_id = d.id) AS entry_count,
      we.entry_number AS winner_entry_number,
      wc.email AS winner_email
    FROM lottery_draws d
    LEFT JOIN lottery_entries we ON we.id = d.winner_entry_id
    LEFT JOIN customers wc ON wc.id = we.customer_id
    ORDER BY d.created_at DESC
    LIMIT 12
  `).all();

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
  const filteredEntryCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${entryFilter.whereSql}
  `).get(...entryFilter.params).count;
  const filteredOrderCount = db.prepare(`
    SELECT COUNT(*) AS count, SUM(o.total_cents) AS total_cents
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${orderFilter.whereSql}
  `).get(...orderFilter.params);

  const orders = db.prepare(`
    SELECT o.*, c.email AS customer_email, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    ${orderFilter.whereSql}
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 25
  `).all(...orderFilter.params);
  const activity = db.prepare(`
    SELECT e.entry_number, e.source, e.status, e.created_at, d.title AS draw_title, c.email, o.order_name
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ${entryFilter.whereSql}
    ORDER BY e.created_at DESC
    LIMIT 40
  `).all(...entryFilter.params);
  const topCustomers = db.prepare(`
    SELECT c.email, c.first_name, c.last_name, COUNT(e.id) AS entry_count,
      SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count
    FROM customers c
    JOIN lottery_entries e ON e.customer_id = c.id
    GROUP BY c.id
    ORDER BY entry_count DESC, c.updated_at DESC
    LIMIT 8
  `).all();
  const sourceBreakdown = db.prepare(`
    SELECT source, COUNT(*) AS count
    FROM lottery_entries
    GROUP BY source
    ORDER BY count DESC
  `).all();
  const statusBreakdown = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM lottery_entries
    GROUP BY status
    ORDER BY count DESC
  `).all();
  const drawStatusBreakdown = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM lottery_draws
    GROUP BY status
    ORDER BY count DESC
  `).all();
  const maxSourceCount = Math.max(1, ...sourceBreakdown.map((row) => row.count));
  const maxStatusCount = Math.max(1, ...statusBreakdown.map((row) => row.count), ...drawStatusBreakdown.map((row) => row.count));
  const entryStatuses = ["ACTIVE", "WINNER", "VOID"];
  const sources = ["ORDER_THRESHOLD", "FREE_ENTRY", "MANUAL", "SUBSCRIPTION"];
  const drawStatuses = ["LIVE", "DRAFT", "DRAWN", "ARCHIVED"];
  const orderStatuses = db.prepare(`
    SELECT DISTINCT financial_status AS status
    FROM orders
    WHERE financial_status IS NOT NULL AND financial_status != ''
    ORDER BY financial_status ASC
  `).all();
  const eligibleWithoutEntry = db.prepare(`
    SELECT COUNT(*) AS count
    FROM orders o
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    WHERE o.total_cents >= 7000 AND e.id IS NULL
  `).get().count;
  const activeLiveEntries = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    WHERE e.status = 'ACTIVE' AND d.status = 'LIVE'
  `).get().count;
  const liveDrawsWithoutEntries = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
      AND NOT EXISTS (SELECT 1 FROM lottery_entries e WHERE e.draw_id = d.id)
  `).get().count;
  const latestWinner = db.prepare(`
    SELECT e.entry_number, d.title AS draw_title, c.email
    FROM lottery_entries e
    JOIN lottery_draws d ON d.winner_entry_id = e.id
    LEFT JOIN customers c ON c.id = e.customer_id
    WHERE e.status = 'WINNER'
    ORDER BY e.created_at DESC
    LIMIT 1
  `).get();
  const monthRows = db.prepare(`
    SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
    FROM lottery_entries
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all().reverse();
  const maxMonthCount = Math.max(1, ...monthRows.map((row) => row.count));
  const chartRows = monthRows.length ? monthRows : Array.from({ length: 12 }, (_, index) => ({ month: `M${index + 1}`, count: 0 }));
  const eligibleRate = percent(orderTotals.eligible_orders || 0, orderTotals.total_orders || 0);
  const freeEntryShare = percent(totals.free_entries || 0, totals.total_entries || 0);
  const voidRate = percent(totals.void_entries || 0, totals.total_entries || 0);
  const entriesPerCustomer = safeDivide(totals.total_entries || 0, totals.participating_customers || 0);
  const entriesPerOrder = safeDivide(totals.order_entries || 0, orderTotals.total_orders || 0);
  const opsItems = [
    {
      icon: "OR",
      title: `${eligibleWithoutEntry} eligible orders zonder lot`,
      body: "Moet normaal 0 zijn. Check ordersync als dit stijgt.",
      badge: eligibleWithoutEntry ? "Check" : "OK"
    },
    {
      icon: "WA",
      title: `${liveDraws} live winactie(s)`,
      body: liveDrawsWithoutEntries ? `${liveDrawsWithoutEntries} live actie heeft nog geen loten.` : `${activeLiveEntries} actieve loten in live trekkingen.`,
      badge: liveDraws ? "Live" : "Maak"
    },
    {
      icon: "CP",
      title: `${freeEntryShare} gratis deelname aandeel`,
      body: "Compliance route blijft zichtbaar naast order-loten.",
      badge: "Monitor"
    },
    {
      icon: "WN",
      title: latestWinner ? `Laatste winnaar ${latestWinner.entry_number}` : "Nog geen winnaar getrokken",
      body: latestWinner ? `${latestWinner.draw_title} · ${latestWinner.email || "klant onbekend"}` : "Trek pas als live actie genoeg geldige loten heeft.",
      badge: latestWinner ? "Done" : "Open"
    }
  ];

  res.send(page("Meat For Free Dashboard", `
    <div class="topbar" id="overview">
      <div class="hero-copy">
        <p class="eyebrow">Meat For Free ops</p>
        <h1>Loten, omzet, orders en winnaars.</h1>
      </div>
      <a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>
    </div>
    <section class="grid" aria-label="Kerncijfers">
      <div class="card card--blue"><p class="muted">Actieve loten</p><div class="stat">${totals.active_entries || 0}</div><p>${totals.total_entries || 0} loten totaal · ${activeLiveEntries} in live acties.</p></div>
      <div class="card card--teal"><p class="muted">Deelnemers</p><div class="stat">${totals.participating_customers || 0}</div><p>${entriesPerCustomer} loten per deelnemer.</p></div>
      <div class="card card--green"><p class="muted">Order eligibility</p><div class="stat">${eligibleRate}</div><p>${orderTotals.eligible_orders || 0} orders boven of gelijk aan €70.</p></div>
      <div class="card card--dark"><p class="muted">Omzet uit app DB</p><div class="stat">${formatEuro(orderTotals.gross_cents || 0)}</div><p>${formatEuro(Math.round(orderTotals.avg_cents || 0))} gemiddelde orderwaarde.</p></div>
    </section>
    <section class="insight-grid">
      <div class="insight"><span>Order-loten</span><strong>${totals.order_entries || 0}</strong></div>
      <div class="insight"><span>Gratis deelnames</span><strong>${totals.free_entries || 0}</strong></div>
      <div class="insight"><span>Winnaars / void</span><strong>${totals.winners || 0}/${totals.void_entries || 0}</strong></div>
      <div class="insight"><span>Laatste 7 dagen</span><strong>${recentEntries}</strong></div>
      <div class="insight"><span>Orders totaal</span><strong>${orderTotals.total_orders || 0}</strong></div>
      <div class="insight"><span>Omzet uit app DB</span><strong>${formatEuro(orderTotals.gross_cents || 0)}</strong></div>
      <div class="insight"><span>Gem. orderwaarde</span><strong>${formatEuro(Math.round(orderTotals.avg_cents || 0))}</strong></div>
      <div class="insight"><span>Vandaag orders</span><strong>${todayOrders}</strong></div>
    </section>
    <section class="ops-grid" id="sync">
      <div class="panel panel-pad">
        <div class="panel-title">
          <div>
            <p class="eyebrow">Realtime analytics</p>
            <h2>Lotvolume per maand.</h2>
          </div>
          <span class="status status--active">${recentEntries} in 7 dagen</span>
        </div>
        <div class="mini-chart" aria-label="Lotvolume per maand">
          ${chartRows.map((row) => `<span title="${escapeHtml(row.month)}: ${row.count}" style="height:${barWidth(row.count, maxMonthCount)}%"></span>`).join("")}
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title">
          <div>
            <p class="eyebrow">Ops queue</p>
            <h2>Nu checken.</h2>
          </div>
        </div>
        <div class="ops-list">
          ${opsItems.map((item) => `<div class="ops-item">
            <span class="ops-icon">${escapeHtml(item.icon)}</span>
            <span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></span>
            <span class="status">${escapeHtml(item.badge)}</span>
          </div>`).join("")}
        </div>
      </div>
    </section>
    <section class="ops-grid" id="compliance">
      <div class="panel panel-pad">
        <div class="panel-title">
          <div>
            <p class="eyebrow">Compliance</p>
            <h2>Gratis route en voids.</h2>
          </div>
        </div>
        <div class="ratio-stack">
          <div class="ratio-row"><div><span>Gratis deelnames</span><strong>${freeEntryShare}</strong></div><div class="bar"><span style="width:${barWidth(totals.free_entries || 0, totals.total_entries || 0)}%"></span></div></div>
          <div class="ratio-row"><div><span>Void rate</span><strong>${voidRate}</strong></div><div class="bar"><span style="width:${barWidth(totals.void_entries || 0, totals.total_entries || 0)}%"></span></div></div>
          <div class="ratio-row"><div><span>Order-loten per order</span><strong>${entriesPerOrder}</strong></div><div class="bar"><span style="width:${barWidth(totals.order_entries || 0, Math.max(orderTotals.total_orders || 0, totals.order_entries || 0))}%"></span></div></div>
        </div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title">
          <div>
            <p class="eyebrow">Acties</p>
            <h2>Snel uitvoeren.</h2>
          </div>
        </div>
        <div class="ops-list">
          <form class="inline-form" method="post" action="/admin/sync-dashboards"><button class="button--gold" type="submit">Sync klantdashboards</button></form>
          <form class="inline-form" method="post" action="/admin/reconcile"><button class="button--ghost" type="submit">Sync orders met loten</button></form>
          <a class="button button--ghost" href="/api/draws/live">Bekijk live API</a>
          <a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>
        </div>
      </div>
    </section>
    <section class="filters" id="filters">
      <h2>Filters</h2>
      <form method="get" action="/admin">
        <div class="filter-grid">
          <label class="wide">Zoek lot / klant / order / winactie
            <input name="q" value="${escapeHtml(entryFilter.filter.q)}" placeholder="Bijv. email, #1001, MFF">
          </label>
          <label>Lotstatus
            <select name="entryStatus">
              ${option("", entryFilter.filter.entryStatus, "Alle lotstatussen")}
              ${entryStatuses.map((status) => option(status, entryFilter.filter.entryStatus, status)).join("")}
            </select>
          </label>
          <label>Bron
            <select name="source">
              ${option("", entryFilter.filter.source, "Alle bronnen")}
              ${sources.map((source) => option(source, entryFilter.filter.source, source)).join("")}
            </select>
          </label>
          <label>Winactie status
            <select name="drawStatus">
              ${option("", entryFilter.filter.drawStatus, "Alle winacties")}
              ${drawStatuses.map((status) => option(status, entryFilter.filter.drawStatus, status)).join("")}
            </select>
          </label>
          <label>Vanaf
            <input type="date" name="from" value="${escapeHtml(entryFilter.filter.from)}">
          </label>
          <label>Tot
            <input type="date" name="to" value="${escapeHtml(entryFilter.filter.to)}">
          </label>
          <label class="wide">Zoek order / orderklant
            <input name="orderQ" value="${escapeHtml(orderFilter.filter.orderQ)}" placeholder="Bijv. #1001 of email">
          </label>
          <label>Orderstatus
            <select name="orderStatus">
              ${option("", orderFilter.filter.orderStatus, "Alle orderstatussen")}
              ${orderStatuses.map((row) => option(row.status, orderFilter.filter.orderStatus, row.status)).join("")}
            </select>
          </label>
          <label>Min. order €
            <input inputmode="decimal" name="minTotal" value="${escapeHtml(orderFilter.filter.minTotal)}" placeholder="70">
          </label>
          <label>Max. order €
            <input inputmode="decimal" name="maxTotal" value="${escapeHtml(orderFilter.filter.maxTotal)}" placeholder="250">
          </label>
          <div class="filter-actions">
            <button type="submit">Filter</button>
            <a class="button button--ghost" href="/admin">Reset</a>
          </div>
        </div>
      </form>
    </section>
    <section class="grid">
      <div class="card"><p class="muted">Gefilterde loten</p><div class="stat">${filteredEntryCount}</div><p>Resultaat van de actieve lotfilters.</p></div>
      <div class="card"><p class="muted">Gefilterde orders</p><div class="stat">${filteredOrderCount.count || 0}</div><p>${formatEuro(filteredOrderCount.total_cents || 0)} waarde.</p></div>
      <div class="card"><p class="muted">Order eligibility</p><div class="stat">${orderTotals.eligible_orders || 0}</div><p>Orders boven of gelijk aan €70.</p></div>
    </section>
    <div class="split-panels">
      <div>
        <div class="section-head"><h2>Bronnen</h2></div>
        <div class="panel">
          <table class="compact-table">
            <thead><tr><th>Bron</th><th>Aantal</th><th>Volume</th></tr></thead>
            <tbody>
              ${sourceBreakdown.length ? sourceBreakdown.map((row) => `<tr>
                <td><strong>${escapeHtml(row.source)}</strong></td>
                <td>${row.count}</td>
                <td><div class="bar"><span style="width:${Math.round((row.count / maxSourceCount) * 100)}%"></span></div></td>
              </tr>`).join("") : `<tr><td colspan="3"><div class="empty">Nog geen bronnen.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="section-head"><h2>Statussen</h2></div>
        <div class="panel">
          <table class="compact-table">
            <thead><tr><th>Type</th><th>Status</th><th>Aantal</th></tr></thead>
            <tbody>
              ${[
                ...statusBreakdown.map((row) => ({ type: "Lot", ...row })),
                ...drawStatusBreakdown.map((row) => ({ type: "Winactie", ...row }))
              ].map((row) => `<tr>
                <td>${escapeHtml(row.type)}</td>
                <td>${statusBadge(row.status)}</td>
                <td><strong>${row.count}</strong><div class="bar"><span style="width:${Math.round((row.count / maxStatusCount) * 100)}%"></span></div></td>
              </tr>`).join("") || `<tr><td colspan="3"><div class="empty">Nog geen statusdata.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="section-head" id="winacties">
      <h2>Winacties</h2>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        <form class="inline-form" method="post" action="/admin/sync-dashboards"><button class="button--gold" type="submit">Sync dashboards</button></form>
        <form class="inline-form" method="post" action="/admin/reconcile"><button class="button--ghost" type="submit">Sync orders</button></form>
      </div>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Titel</th><th>Status</th><th>Prijs</th><th>Loten</th><th>Winnaar</th><th>Actie</th></tr></thead>
        <tbody>
          ${draws.length ? draws.map((draw) => `<tr>
            <td><strong>${escapeHtml(draw.title)}</strong><br><span class="muted">${escapeHtml(draw.slug)}</span></td>
            <td>${statusBadge(draw.status)}</td>
            <td><strong>${escapeHtml(draw.prize_name)}</strong><br><span class="muted">${escapeHtml(draw.prize_value || "")}</span></td>
            <td>${draw.entry_count}</td>
            <td>${escapeHtml(draw.winner_email || draw.winner_entry_number || "-")}</td>
            <td><div style="display:flex; flex-wrap:wrap; gap:8px;">
              <a class="button button--ghost" href="/admin/draws/${escapeHtml(draw.id)}/export.csv">Export</a>
              ${draw.status === "LIVE" ? `<form class="inline-form" method="post" action="/admin/draws/${escapeHtml(draw.id)}/draw"><button type="submit">Trek winnaar</button></form>` : ""}
            </div></td>
          </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Nog geen winacties. Maak de eerste live trekking aan.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="section-head" id="lotactiviteit">
      <h2>Gefilterde lotactiviteit</h2>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Lot</th><th>Bron</th><th>Klant</th><th>Winactie</th><th>Status</th><th>Datum</th></tr></thead>
        <tbody>
          ${activity.length ? activity.map((entry) => `<tr>
            <td><strong>${escapeHtml(entry.entry_number)}</strong><br><span class="muted">${escapeHtml(entry.order_name || entry.created_at)}</span></td>
            <td>${escapeHtml(entry.source)}</td>
            <td>${escapeHtml(entry.email || "-")}</td>
            <td>${escapeHtml(entry.draw_title)}</td>
            <td>${statusBadge(entry.status)}</td>
            <td>${escapeHtml(entry.created_at)}</td>
          </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen loten binnen deze filters.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="section-head" id="deelnemers">
      <h2>Top deelnemers</h2>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Klant</th><th>Totaal loten</th><th>Actieve loten</th></tr></thead>
        <tbody>
          ${topCustomers.length ? topCustomers.map((customer) => `<tr>
            <td><strong>${escapeHtml([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Klant")}</strong><br><span class="muted">${escapeHtml(customer.email || "-")}</span></td>
            <td>${customer.entry_count}</td>
            <td>${customer.active_count}</td>
          </tr>`).join("") : `<tr><td colspan="3"><div class="empty">Nog geen deelnemersranglijst.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="section-head" id="orders">
      <h2>Gefilterde orders</h2>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Order</th><th>Klant</th><th>Waarde</th><th>Loten</th><th>Status</th><th>Datum</th></tr></thead>
        <tbody>
          ${orders.length ? orders.map((order) => `<tr>
            <td><strong>${escapeHtml(order.order_name || order.shopify_order_id)}</strong></td>
            <td>${escapeHtml(order.customer_email || order.email || "-")}</td>
            <td>${formatEuro(order.total_cents)}</td>
            <td>${order.entry_count}</td>
            <td>${statusBadge(order.financial_status || "-")}</td>
            <td>${escapeHtml(order.created_at)}</td>
          </tr>`).join("") : `<tr><td colspan="6"><div class="empty">Geen orders binnen deze filters.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `));
});

adminRouter.get("/draws/:id/export.csv", (req, res) => {
  const draw = db.prepare("SELECT * FROM lottery_draws WHERE id = ?").get(req.params.id);
  if (!draw) return res.status(404).send("Draw not found");

  const rows = db.prepare(`
    SELECT e.entry_number, e.source, e.status, e.reason, e.created_at, c.email, c.first_name, c.last_name, o.order_name, o.total_cents
    FROM lottery_entries e
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.draw_id = ?
    ORDER BY e.created_at ASC
  `).all(draw.id);
  const header = ["entry_number", "status", "source", "email", "first_name", "last_name", "order_name", "order_total", "reason", "created_at"];
  const body = rows.map((row) => [
    row.entry_number,
    row.status,
    row.source,
    row.email,
    row.first_name,
    row.last_name,
    row.order_name,
    formatEuro(row.total_cents || 0),
    row.reason,
    row.created_at
  ].map(csv).join(","));

  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${draw.slug || draw.id}-entries.csv"`);
  return res.send([header.map(csv).join(","), ...body].join("\n"));
});

adminRouter.get("/new-draw", (_req, res) => {
  res.send(page("Nieuwe winactie", `
    <div class="topbar">
      <div class="hero-copy">
        <p class="eyebrow">Nieuwe trekking</p>
        <h1>Nieuwe winactie.</h1>
      </div>
      <a class="button button--ghost" href="/admin">Terug</a>
    </div>
    <form method="post" action="/admin/draws">
      <label>Titel<input name="title" required placeholder="Bijv. Juni BBQ Trekking"></label>
      <label>Prijsnaam<input name="prizeName" required placeholder="Bijv. 1 jaar gratis vlees"></label>
      <label>Prijswaarde<input name="prizeValue" placeholder="Bijv. Hoofdprijs"></label>
      <label>Beschrijving<textarea name="description" rows="4"></textarea></label>
      <label>Status<select name="status"><option value="DRAFT">Draft</option><option value="LIVE">Live</option></select></label>
      <div class="form-actions">
        <button type="submit">Opslaan</button>
        <a class="button button--ghost" href="/admin">Annuleren</a>
      </div>
    </form>
  `));
});

adminRouter.post("/draws", express.urlencoded({ extended: false }), async (req, res) => {
  await createDraw({
    title: req.body.title,
    prizeName: req.body.prizeName,
    prizeValue: req.body.prizeValue,
    description: req.body.description,
    status: req.body.status === "LIVE" ? "LIVE" : "DRAFT"
  });
  res.redirect("/admin");
});

adminRouter.post("/draws/:id/draw", async (req, res) => {
  try {
    await drawWinner(req.params.id);
    res.redirect("/admin");
  } catch (error) {
    res.status(400).send(page("Trekking fout", `<div class="hero-copy"><p class="eyebrow">Actie gestopt</p><h1>Kan niet trekken.</h1><p class="muted">${escapeHtml(error.message)}</p><p><a class="button button--gold" href="/admin">Terug</a></p></div>`));
  }
});

adminRouter.post("/reconcile", async (_req, res) => {
  await reconcileActiveOrderEntries();
  res.redirect("/admin");
});

adminRouter.post("/sync-dashboards", async (_req, res) => {
  await syncAllCustomerDashboardMetafields();
  res.redirect("/admin");
});
