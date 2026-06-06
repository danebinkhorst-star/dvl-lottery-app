import express from "express";
import { db } from "../db.js";
import { createDraw, drawWinner } from "../services/lottery.js";
import { formatEuro } from "../utils.js";

export const adminRouter = express.Router();

function page(title, body) {
  return `<!doctype html>
  <html lang="nl">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        :root { --bg:#fbf6ea; --ink:#241a14; --red:#8e2b20; --gold:#c8a25b; --line:#d8ccb4; --dark:#161313; }
        * { box-sizing: border-box; }
        body { margin:0; font-family: Inter, Arial, sans-serif; background:var(--bg); color:var(--ink); }
        header { background:var(--dark); color:var(--bg); padding:22px clamp(18px, 4vw, 56px); display:flex; justify-content:space-between; gap:18px; align-items:center; }
        header strong { text-transform:uppercase; letter-spacing:.08em; }
        main { padding: clamp(18px, 4vw, 56px); max-width: 1280px; margin: 0 auto; }
        h1, h2, h3 { text-transform: uppercase; line-height: .95; margin: 0 0 16px; }
        h1 { font-size: clamp(42px, 7vw, 96px); max-width: 840px; }
        h2 { font-size: clamp(26px, 3vw, 44px); }
        .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:14px; }
        .card, form { border:1px solid var(--line); background:#fffaf0; padding:22px; border-radius:0; }
        .stat { font-size:34px; font-weight:900; color:var(--red); }
        .muted { color:#6b5d49; }
        a, button { color:inherit; }
        button, .button { background:var(--red); color:white; border:0; padding:13px 18px; font-weight:900; text-transform:uppercase; text-decoration:none; display:inline-flex; cursor:pointer; border-radius:0; }
        input, textarea, select { width:100%; padding:12px; border:1px solid var(--line); background:white; margin:6px 0 14px; font:inherit; }
        table { width:100%; border-collapse:collapse; background:white; }
        th, td { padding:12px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
        .topbar { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; align-items:flex-start; margin-bottom:32px; }
      </style>
    </head>
    <body>
      <header><strong>De Vlees Loterij App</strong><nav><a href="/admin">Dashboard</a></nav></header>
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
  const orders = db.prepare(`
    SELECT o.*, c.email AS customer_email, COUNT(e.id) AS entry_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN lottery_entries e ON e.order_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 8
  `).all();

  res.send(page("DVL Lottery Dashboard", `
    <div class="topbar">
      <div>
        <p class="muted">CUSTOM LOTTERY SYSTEM</p>
        <h1>Loten, trekkingen en winnaars.</h1>
      </div>
      <a class="button" href="/admin/new-draw">Nieuwe winactie</a>
    </div>
    <section class="grid">
      <div class="card"><p class="muted">Actieve loten</p><div class="stat">${entries}</div></div>
      <div class="card"><p class="muted">Klanten met deelname</p><div class="stat">${customers}</div></div>
      <div class="card"><p class="muted">Regel</p><div class="stat">€70</div><p>1 gratis lot bij bestelling vanaf €70.</p></div>
    </section>
    <h2 style="margin-top:40px">Winacties</h2>
    <table>
      <thead><tr><th>Titel</th><th>Status</th><th>Prijs</th><th>Loten</th><th>Winnaar</th><th></th></tr></thead>
      <tbody>
        ${draws.map((draw) => `<tr>
          <td><strong>${draw.title}</strong><br><span class="muted">${draw.slug}</span></td>
          <td>${draw.status}</td>
          <td>${draw.prize_name}<br><span class="muted">${draw.prize_value || ""}</span></td>
          <td>${draw.entry_count}</td>
          <td>${draw.winner_email || draw.winner_entry_number || "-"}</td>
          <td>${draw.status === "LIVE" ? `<form method="post" action="/admin/draws/${draw.id}/draw" style="padding:0;border:0;background:transparent"><button type="submit">Trek winnaar</button></form>` : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    <h2 style="margin-top:40px">Laatste orders</h2>
    <table>
      <thead><tr><th>Order</th><th>Klant</th><th>Waarde</th><th>Loten</th><th>Status</th></tr></thead>
      <tbody>
        ${orders.map((order) => `<tr>
          <td>${order.order_name || order.shopify_order_id}</td>
          <td>${order.customer_email || order.email || "-"}</td>
          <td>${formatEuro(order.total_cents)}</td>
          <td>${order.entry_count}</td>
          <td>${order.financial_status || "-"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  `));
});

adminRouter.get("/new-draw", (_req, res) => {
  res.send(page("Nieuwe winactie", `
    <h1>Nieuwe winactie.</h1>
    <form method="post" action="/admin/draws">
      <label>Titel<input name="title" required placeholder="Bijv. Juni BBQ Trekking"></label>
      <label>Prijsnaam<input name="prizeName" required placeholder="Bijv. 1 jaar gratis vlees"></label>
      <label>Prijswaarde<input name="prizeValue" placeholder="Bijv. Hoofdprijs"></label>
      <label>Beschrijving<textarea name="description" rows="4"></textarea></label>
      <label>Status<select name="status"><option value="DRAFT">Draft</option><option value="LIVE">Live</option></select></label>
      <button type="submit">Opslaan</button>
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
    res.status(400).send(page("Trekking fout", `<h1>Kan niet trekken.</h1><p>${error.message}</p><p><a href="/admin">Terug</a></p>`));
  }
});
