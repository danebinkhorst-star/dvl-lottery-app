import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db.js";
import { createDraw, createFreeEntry } from "../services/lottery.js";
import { buildCustomerDashboardPayload, syncAllCustomerDashboardMetafields } from "../services/customer-dashboard.js";
import { reconcileActiveOrderEntries } from "../services/reconcile.js";
import { getAllWidgetSettings, getLotteryRule, getSiteStructure } from "../services/settings.js";
import { productCardsForEmbed, productSyncStatus, syncShopifyProducts } from "../services/shopify-products.js";
import { clientIp, recordSecurityEvent } from "../services/security-events.js";
import { recordAnalyticsEvent } from "../services/analytics.js";
import { isValidWriteSecret, signCustomerToken, verifyCustomerAccessToken, verifyCustomerToken } from "../auth.js";
import { createAuction, getAuctionByProduct, listAuctions, placeAuctionBid, publicAuction } from "../services/auctions.js";

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
  handler: (req, res) => {
    recordSecurityEvent({
      eventType: "FREE_ENTRY_RATE_LIMIT",
      req,
      email: req.body?.email,
      message: "Gratis deelname rate limit geraakt."
    });
    res.status(429).json({ error: "Te veel gratis deelnameverzoeken. Probeer het later opnieuw." });
  }
});
const adminWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    recordSecurityEvent({
      eventType: "INTERNAL_WRITE_RATE_LIMIT",
      req,
      message: "Interne schrijfactie rate limit geraakt."
    });
    res.status(429).json({ error: "Te veel schrijfacties in korte tijd. Probeer het straks opnieuw." });
  }
});
const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  }
});
const bidLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) => {
    recordSecurityEvent({
      eventType: "AUCTION_BID_RATE_LIMIT",
      req,
      email: req.body?.customerEmail,
      message: "Veiling bieding rate limit geraakt."
    });
    res.status(429).json({ error: "Te veel biedingen in korte tijd. Probeer het zo opnieuw." });
  }
});
const analyticsEventSchema = z.object({
  eventType: z.string().trim().max(64).optional().default("widget_event"),
  widget: z.string().trim().max(40),
  action: z.string().trim().max(80),
  target: z.string().trim().max(180).optional().default(""),
  value: z.union([z.string().trim().max(240), z.number(), z.boolean()]).optional().default(""),
  pageUrl: z.string().trim().max(520).optional().default(""),
  referrer: z.string().trim().max(520).optional().default(""),
  shopOrigin: z.string().trim().max(520).optional().default(""),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().default({})
});
const auctionBidSchema = z.object({
  shopifyCustomerId: z.string().trim().min(1).max(80),
  customerEmail: z.string().trim().email().max(160),
  customerName: z.string().trim().max(140).optional().default(""),
  amount: z.union([z.string().trim().max(40), z.number()])
});

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
  const rule = getLotteryRule();
  const draw = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM lottery_entries e WHERE e.draw_id = d.id AND e.status = 'ACTIVE') AS entry_count
    FROM lottery_draws d
    WHERE d.status = 'LIVE'
    ORDER BY d.starts_at DESC
    LIMIT 1
  `).get();
  const latestWinners = db.prepare(`
    SELECT
      e.entry_number,
      e.created_at,
      d.title AS draw_title,
      d.prize_name,
      d.winner_public_name,
      d.winner_public_statement,
      d.winner_public_image_url,
      d.winner_public_approved_at,
      c.first_name,
      c.email
    FROM lottery_entries e
    JOIN lottery_draws d ON d.winner_entry_id = e.id
    LEFT JOIN customers c ON c.id = e.customer_id
    WHERE e.status = 'WINNER'
      AND d.winner_public_status = 'PUBLIC'
      AND d.winner_consent_status = 'APPROVED'
      AND LENGTH(TRIM(COALESCE(d.winner_public_name, ''))) > 0
      AND LENGTH(TRIM(COALESCE(d.winner_public_statement, ''))) > 0
    ORDER BY COALESCE(d.winner_public_approved_at, d.draw_at) DESC
    LIMIT 6
  `).all();
  const widgets = getAllWidgetSettings();
  const productWidget = widgets["product-cards"] || {};
  const syncedProductLimit = Math.max(1, Math.min(12, Number(productWidget.productLimit || 8)));
  const productStatusFilter = String(productWidget.productStatusFilter || "").trim();
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
      name: winner.winner_public_name || winner.first_name || (winner.email ? `${winner.email.slice(0, 2)}***` : "Winnaar"),
      story: winner.winner_public_statement || "",
      imageUrl: winner.winner_public_image_url || "",
      createdAt: winner.created_at,
      avatarSeed: `${winner.entry_number}-${winner.draw_title || winner.prize_name || "mff"}`
    })),
    widgets,
    siteStructure: getSiteStructure(),
    products: {
      productCards: productWidget.productSource === "manual"
        ? []
        : productCardsForEmbed({ limit: syncedProductLimit, statusTag: productStatusFilter }),
      sync: productSyncStatus()
    }
  });
});

apiRouter.post("/events", analyticsLimiter, async (req, res) => {
  try {
    const payload = analyticsEventSchema.parse(req.body || {});
    recordAnalyticsEvent(req, payload);
    return res.status(204).end();
  } catch (_error) {
    return res.status(204).end();
  }
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
      recordSecurityEvent({
        eventType: "FREE_ENTRY_ATTEMPT_LIMIT",
        req,
        email: payload.email,
        message: "Gratis deelname poginglimiet geraakt."
      });
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
    if (String(error.message || "").toLowerCase().includes("gratis deelname")) {
      recordSecurityEvent({
        eventType: "FREE_ENTRY_DUPLICATE_OR_BLOCKED",
        req,
        email: req.body?.email,
        message: error.message
      });
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

apiRouter.get("/auctions", async (req, res) => {
  const status = String(req.query.status || "");
  const auctions = listAuctions({ status, publicOnly: true, limit: req.query.limit || 80 }).map(publicAuction);
  return res.json({ auctions });
});

apiRouter.get("/auctions/product/:shopifyProductId", async (req, res) => {
  const auction = getAuctionByProduct(req.params.shopifyProductId);
  if (!auction) return res.status(404).json({ error: "Geen veiling gevonden voor dit product." });
  return res.json({ auction: publicAuction(auction) });
});

apiRouter.post("/auctions/:auctionId/bids", bidLimiter, async (req, res) => {
  try {
    const payload = auctionBidSchema.parse(req.body || {});
    const suppliedToken = req.get("x-dvl-customer-token") || "";
    if (!verifyCustomerAccessToken(payload.shopifyCustomerId, suppliedToken)) {
      recordSecurityEvent({
        eventType: "AUCTION_BID_UNAUTHORIZED",
        req,
        email: payload.customerEmail,
        message: "Veiling bod zonder geldige klanttoken."
      });
      return res.status(401).json({ error: "Log opnieuw in voordat je biedt." });
    }
    const result = placeAuctionBid(req.params.auctionId, {
      ...payload,
      ip: clientIp(req),
      userAgent: req.get("user-agent") || ""
    });
    return res.status(201).json({
      ok: true,
      auction: publicAuction(result.auction),
      bid: {
        id: result.bid.id,
        amountCents: result.bid.amount_cents,
        status: result.bid.status,
        createdAt: result.bid.created_at
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Controleer je bod en klantgegevens." });
    return res.status(400).json({ error: error.message || "Bod kon niet worden geplaatst." });
  }
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

apiRouter.post("/auctions", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const auction = createAuction(req.body || {});
  return res.status(201).json({ auction: publicAuction(auction) });
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

apiRouter.post("/sync/products", adminWriteLimiter, async (req, res) => {
  const suppliedSecret = req.get("x-dvl-admin-secret") || "";
  if (!isValidWriteSecret(suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const result = await syncShopifyProducts({ limit: req.body?.limit || 100 });
  return res.json({ ok: true, ...result });
});
