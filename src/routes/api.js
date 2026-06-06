import express from "express";
import { db } from "../db.js";
import { createDraw } from "../services/lottery.js";

export const apiRouter = express.Router();

apiRouter.use(express.json());

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

apiRouter.get("/customers/:shopifyCustomerId/entries", async (req, res) => {
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

apiRouter.post("/draws", async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  const requiredSecret = process.env.ADMIN_PASSWORD || "";
  if (requiredSecret && suppliedSecret !== requiredSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const draw = await createDraw(req.body);
  return res.status(201).json({ draw });
});
