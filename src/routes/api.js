import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db.js";
import { createDraw, createFreeEntry } from "../services/lottery.js";
import { buildCustomerDashboardPayload, syncAllCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { getAllWidgetSettings, getLotteryRule, getSiteStructure } from "../services/settings.js";
import { isValidWriteSecret, signCustomerToken, verifyCustomerToken } from "../auth.js";

export const apiRouter = express.Router();

apiRouter.use(express.json({ limit: "16kb" }));

const freeEntryAttempts = new Map();
const freeEntrySchema = z.object({
  email: z.string().trim().email().max(160),
  firstName: z.string().trim().max(80).optional().default(""),
  lastName: z.string().trim().max(80).optional().default(""),
  drawId: z.string().trim().max(64).optional(),
  website: z.string().trim().max(120).optional().default("")
});
const freeEntryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Te veel gratis deelnameverzoeken. Probeer het later opnieuw." }
});
const adminWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Te veel schrijfacties in korte tijd. Probeer het straks opnieuw." }
});

function allowFreeEntryAttempt(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (freeEntryAttempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  attempts.push(now);
  freeEntryAttempts.set(key, attempts);
  return attempts.length <= 5;
}

function clientIp(req) {
  const forwarded = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
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
  const rule = getLotteryRule();
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
      label: rule.LOT_RULE_MODE === "PER_AMOUNT"
        ? `1 lot per ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(rule.LOT_PER_CENTS / 100)}`
        : `1 gratis lot bij bestelling vanaf ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(rule.LOT_ORDER_MINIMUM_CENTS / 100)}`,
      minimumCents: rule.LOT_ORDER_MINIMUM_CENTS,
      perCents: rule.LOT_PER_CENTS,
      mode: rule.LOT_RULE_MODE,
      freeEntryEnabled: rule.FREE_ENTRY_ENABLED
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
      createdAt: winner.created_at,
      avatarSeed: `${winner.entry_number}-${winner.draw_title || winner.prize_name || "mff"}`
    })),
    widgets: getAllWidgetSettings(),
    siteStructure: getSiteStructure()
  });
});

apiRouter.post("/free-entry", freeEntryLimiter, async (req, res) => {
  try {
    const payload = freeEntrySchema.parse(req.body || {});
    if (payload.website) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const ipAddress = clientIp(req);
    const attemptKey = String(payload.email || ipAddress || "unknown").trim().toLowerCase();
    if (!allowFreeEntryAttempt(attemptKey)) {
      return res.status(429).json({ error: "Te veel aanvragen. Probeer het later opnieuw." });
    }
    const result = await createFreeEntry({
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      drawId: payload.drawId,
      ipAddress,
      userAgent: req.get("user-agent") || ""
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
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      if (firstIssue?.path?.[0] === "email") {
        return res.status(400).json({ error: "Vul een geldig e-mailadres in." });
      }
      return res.status(400).json({ error: "Controleer de ingevulde gegevens." });
    }
    return res.status(400).json({ error: error.message || "Ongeldige aanvraag." });
  }
});

apiRouter.get("/customers/:shopifyCustomerId/entries", async (req, res) => {
  const suppliedToken = req.get("x-dvl-customer-token") || "";
  if (!verifyCustomerToken(req.params.shopifyCustomerId, suppliedToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const customer = db.prepare("SELECT * FROM customers WHERE shopify_customer_id = ?").get(req.params.shopifyCustomerId);
  if (!customer) return res.json({
    summary: {
      totalEntries: 0,
      activeEntries: 0,
      winningEntries: 0,
      liveDrawEntries: 0
    },
    activeDraw: null,
    orders: [],
    entries: []
  });
  res.json(buildCustomerDashboardPayload(customer));
});

apiRouter.post("/customers/:shopifyCustomerId/token", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.json({
    shopifyCustomerId: req.params.shopifyCustomerId,
    token: signCustomerToken(req.params.shopifyCustomerId)
  });
});

apiRouter.post("/draws", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const draw = await createDraw(req.body);
  return res.status(201).json({ draw });
});

apiRouter.post("/reconcile/orders", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await reconcileActiveOrderEntries();
  return res.json({ ok: true, ...result });
});

apiRouter.post("/sync/customer-dashboards", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await syncAllCustomerDashboardMetafields();
  return res.json({ ok: true, ...result });
});
