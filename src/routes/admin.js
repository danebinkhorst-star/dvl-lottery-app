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
          background:
            radial-gradient(circle at 16% 10%, rgba(240, 191, 57, .28), transparent 24rem),
            linear-gradient(135deg, var(--cream) 0%, #fff8ec 48%, var(--cream-2) 100%);
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
          margin: 0 clamp(10px, 2vw, 26px);
          transform: translateY(-1px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 18px clamp(16px, 3vw, 34px);
          border: 3px solid var(--line);
          border-top: 0;
          border-radius: 0 0 42px 42px;
          background: var(--paper);
          box-shadow: var(--shadow);
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
          content:"LOTEN";
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: clamp(12px, 1.8vw, 20px);
          margin-bottom: clamp(34px, 5vw, 62px);
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
          overflow: hidden;
          border: 3px solid var(--line);
          border-radius: 34px 14px 34px 14px;
          background: rgba(255, 250, 240, .9);
          box-shadow: 10px 10px 0 rgba(33, 21, 15, .14);
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
        @media (max-width: 900px) {
          header { border-radius: 0 0 28px 28px; align-items:flex-start; }
          .topbar { grid-template-columns: 1fr; align-items:start; }
          .grid { grid-template-columns: 1fr; }
          .section-head { display:block; }
          .panel { overflow-x:auto; }
          table { min-width: 760px; }
        }
        @media (max-width: 560px) {
          .announce { font-size: 10px; }
          header { margin: 0 8px; padding: 14px; gap: 10px; }
          .brand-mark { width: 44px; height:44px; }
          nav .button { min-height: 42px; padding: 0 14px; font-size: 11px; }
          main { padding-inline: 10px; }
          .hero-copy { border-radius: 30px 12px 30px 12px; }
          h1 { font-size: clamp(34px, 10vw, 40px); line-height: .9; }
        }
      </style>
    </head>
    <body>
      <div class="announce">DVL control room · loten bij €70 · live trekkingen · eerlijke winnaars</div>
      <header>
        <a class="brand" href="/admin" aria-label="De Vlees Loterij dashboard">
          <span class="brand-mark">DVL</span>
          <span><strong>De Vlees<br>Loterij</strong><span>Lottery app</span></span>
        </a>
        <nav>
          <a class="button button--ghost" href="/api/draws/live">Live API</a>
          <a class="button button--gold" href="/admin">Dashboard</a>
        </nav>
      </header>
      <main>${body}</main>
    </body>
  </html>`;
}

adminRouter.get("/", async (_req, res) => {
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
  const entries = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'ACTIVE'").get().count;
  const customers = db.prepare("SELECT COUNT(*) AS count FROM customers").get().count;
  const freeEntries = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE source = 'FREE_ENTRY'").get().count;
  const orderEntries = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE source = 'ORDER_THRESHOLD'").get().count;
  const winners = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'WINNER'").get().count;
  const voidEntries = db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'VOID'").get().count;
  const orders = db.prepare(`
    SELECT o.*, c.email AS customer_email, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 8
  `).all();
  const activity = db.prepare(`
    SELECT e.entry_number, e.source, e.status, e.created_at, d.title AS draw_title, c.email, o.order_name
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN customers c ON c.id = e.customer_id
    LEFT JOIN orders o ON o.id = e.order_id
    ORDER BY e.created_at DESC
    LIMIT 10
  `).all();
  const topCustomers = db.prepare(`
    SELECT c.email, c.first_name, c.last_name, COUNT(e.id) AS entry_count,
      SUM(CASE WHEN e.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count
    FROM customers c
    JOIN lottery_entries e ON e.customer_id = c.id
    GROUP BY c.id
    ORDER BY entry_count DESC, c.updated_at DESC
    LIMIT 8
  `).all();

  res.send(page("DVL Lottery Dashboard", `
    <div class="topbar">
      <div class="hero-copy">
        <p class="eyebrow">Custom lottery system</p>
        <h1>Loten, trekkingen en winnaars.</h1>
      </div>
      <a class="button button--gold" href="/admin/new-draw">Nieuwe winactie</a>
    </div>
    <section class="grid">
      <div class="card"><p class="muted">Actieve loten</p><div class="stat">${entries}</div></div>
      <div class="card"><p class="muted">Klanten met deelname</p><div class="stat">${customers}</div></div>
      <div class="card"><p class="muted">Regel</p><div class="stat">€70</div><p>1 gratis lot bij bestelling vanaf €70.</p></div>
    </section>
    <section class="grid">
      <div class="card"><p class="muted">Order-loten</p><div class="stat">${orderEntries}</div><p>Automatisch uit Shopify orders.</p></div>
      <div class="card"><p class="muted">Gratis deelnames</p><div class="stat">${freeEntries}</div><p>Compliance-route zonder aankoop.</p></div>
      <div class="card"><p class="muted">Winnaars / ongeldig</p><div class="stat">${winners}/${voidEntries}</div><p>Getrokken winnaars en geannuleerde loten.</p></div>
    </section>
    <div class="section-head">
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
    <div class="section-head">
      <h2>Live activiteit</h2>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Lot</th><th>Bron</th><th>Klant</th><th>Winactie</th><th>Status</th></tr></thead>
        <tbody>
          ${activity.length ? activity.map((entry) => `<tr>
            <td><strong>${escapeHtml(entry.entry_number)}</strong><br><span class="muted">${escapeHtml(entry.order_name || entry.created_at)}</span></td>
            <td>${escapeHtml(entry.source)}</td>
            <td>${escapeHtml(entry.email || "-")}</td>
            <td>${escapeHtml(entry.draw_title)}</td>
            <td>${statusBadge(entry.status)}</td>
          </tr>`).join("") : `<tr><td colspan="5"><div class="empty">Nog geen lotactiviteit.</div></td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="section-head">
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
    <div class="section-head">
      <h2>Laatste orders</h2>
    </div>
    <div class="panel">
      <table>
        <thead><tr><th>Order</th><th>Klant</th><th>Waarde</th><th>Loten</th><th>Status</th></tr></thead>
        <tbody>
          ${orders.length ? orders.map((order) => `<tr>
            <td><strong>${escapeHtml(order.order_name || order.shopify_order_id)}</strong></td>
            <td>${escapeHtml(order.customer_email || order.email || "-")}</td>
            <td>${formatEuro(order.total_cents)}</td>
            <td>${order.entry_count}</td>
            <td>${statusBadge(order.financial_status || "-")}</td>
          </tr>`).join("") : `<tr><td colspan="5"><div class="empty">Nog geen orders met loten. Plaats een testorder vanaf €70 om de flow te zien.</div></td></tr>`}
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
