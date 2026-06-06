import express from "express";
import { db } from "../db.js";
import { createDraw, createFreeEntry } from "../services/lottery.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { isValidWriteSecret, signCustomerToken, verifyCustomerToken } from "../auth.js";

export const apiRouter = express.Router();

apiRouter.use(express.json());

const freeEntryAttempts = new Map();

function allowFreeEntryAttempt(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (freeEntryAttempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  attempts.push(now);
  freeEntryAttempts.set(key, attempts);
  return attempts.length <= 5;
}

apiRouter.get("/draws/live", async (_req, res) => {
  const draws = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM lottery_entries e WHERE e.draw_id = d.id AND e.status = 'ACTIVE') AS entry_count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
    ORDER BY d.starts_at DESC
  `).all();
  res.json({
    draws: draws.map((draw) => ({
      id: draw.id,
      title: draw.title,
      slug: draw.slug,
      description: draw.description,
      prizeName: draw.prize_name,
      prizeValue: draw.prize_value,
      startsAt: draw.starts_at,
      endsAt: draw.ends_at,
      drawAt: draw.draw_at,
      entryCount: draw.entry_count
    }))
  });
});

apiRouter.get("/site/summary", async (_req, res) => {
  const draw = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM lottery_entries e WHERE e.draw_id = d.id AND e.status = 'ACTIVE') AS entry_count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
    ORDER BY d.starts_at DESC
    LIMIT 1
  `).get();
  const latestWinners = db.prepare(`
    SELECT e.entry_number, e.created_at, d.title AS draw_title, d.prize_name, c.first_name, c.email
    FROM lottery_entries e
    JOIN lottery_draws d ON d.winner_entry_id = e.id
    LEFT JOIN customers c ON c.id = e.customer_id
    WHERE e.status = 'WINNER'
    ORDER BY d.draw_at DESC
    LIMIT 6
  `).all();
  res.json({
    rule: {
      label: "1 gratis lot bij bestelling vanaf EUR 70",
      minimumCents: 7000
    },
    liveDraw: draw ? {
      id: draw.id,
      title: draw.title,
      description: draw.description,
      prizeName: draw.prize_name,
      prizeValue: draw.prize_value,
      startsAt: draw.starts_at,
      endsAt: draw.ends_at,
      drawAt: draw.draw_at,
      entryCount: draw.entry_count
    } : null,
    latestWinners: latestWinners.map((winner) => ({
      entryNumber: winner.entry_number,
      drawTitle: winner.draw_title,
      prizeName: winner.prize_name,
      name: winner.first_name || (winner.email ? `${winner.email.slice(0, 2)}***` : "Winnaar"),
      createdAt: winner.created_at
    }))
  });
});

apiRouter.post("/free-entry", async (req, res) => {
  try {
    if (req.body?.website) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const attemptKey = String(req.body?.email || req.ip || "unknown").trim().toLowerCase();
    if (!allowFreeEntryAttempt(attemptKey)) {
      return res.status(429).json({ error: "Te veel aanvragen. Probeer het later opnieuw." });
    }
    const result = await createFreeEntry({
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      drawId: req.body.drawId
    });
    return res.status(201).json({
      ok: true,
      skipped: result.skipped || null,
      entry: {
        entryNumber: result.entry.entry_number,
        status: result.entry.status,
        source: result.entry.source
      },
      draw: {
        title: result.draw.title,
        prizeName: result.draw.prize_name
      }
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

apiRouter.get("/customers/:shopifyCustomerId/entries", async (req, res) => {
  const suppliedToken = req.get("x-dvl-customer-token") || req.query.token || "";
  if (!verifyCustomerToken(req.params.shopifyCustomerId, suppliedToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const customer = db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ?").get(req.params.shopifyCustomerId);
  if (!customer) return res.json({ totalEntries: 0, entries: [] });
  const entries = db.prepare(`
    SELECT e.*, d.title AS draw_title, d.prize_name AS draw_prize_name, d.status AS draw_status, o.order_name
    FROM lottery_entries e
    JOIN lottery_draws d ON d.id = e.draw_id
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.customer_id = ?
    ORDER BY e.created_at DESC
  `).all(customer.id);
  res.json({
    totalEntries: customer.total_entries,
    entries: entries.map((entry) => ({
      entryNumber: entry.entry_number,
      status: entry.status,
      source: entry.source,
      createdAt: entry.created_at,
      draw: {
        title: entry.draw_title,
        prizeName: entry.draw_prize_name,
        status: entry.draw_status
      },
      orderName: entry.order_name || null
    }))
  });
});

apiRouter.post("/customers/:shopifyCustomerId/token", async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json({
    shopifyCustomerId: req.params.shopifyCustomerId,
    token: signCustomerToken(req.params.shopifyCustomerId)
  });
});

apiRouter.post("/draws", async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const draw = await createDraw(req.body);
  return res.status(201).json({ draw });
});

apiRouter.post("/reconcile/orders", async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await reconcileActiveOrderEntries();
  return res.json({ ok: true, ...result });
});
