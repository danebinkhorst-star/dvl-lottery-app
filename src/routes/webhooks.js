import express from "express";
import { config } from "../config.js";
import { db } from "../db.js";
import { syncCustomerDashboardMetafields, syncShopifyCustomerAuctionToken } from "../services/customer-dashboard.js";
import { assignEntriesForOrder, voidEntriesForOrder } from "../services/lottery.js";
import { applyLoyaltyRefund, reconcileLoyaltyForOrder } from "../services/loyalty.js";
import { verifyShopifyWebhook } from "../utils.js";

export const webhookRouter = express.Router();

function parseWebhook(req, res, next) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  const valid = verifyShopifyWebhook(req.body, hmac, config.SHOPIFY_WEBHOOK_SECRET);
  if (!valid) return res.status(401).send("Invalid webhook signature");
  try {
    req.webhookPayload = JSON.parse(req.body.toString("utf8"));
    return next();
  } catch {
    return res.status(400).send("Invalid JSON");
  }
}

function webhookContext(req, fallbackTopic) {
  return {
    eventId: String(req.get("X-Shopify-Webhook-Id") || ""),
    topic: String(req.get("X-Shopify-Topic") || fallbackTopic)
  };
}

async function processPaidOrder(req) {
  const result = await assignEntriesForOrder(req.webhookPayload);
  const loyalty = reconcileLoyaltyForOrder(req.webhookPayload, webhookContext(req, "orders/paid"));
  if (result.order?.customer_id) await syncCustomerDashboardMetafields(result.order.customer_id);
  return { result, loyalty };
}

webhookRouter.post("/orders/paid", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const { result, loyalty } = await processPaidOrder(req);
  res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    loyalty,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/create", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  if (req.webhookPayload.financial_status !== "paid") {
    return res.status(200).json({ ok: true, skipped: "order_not_paid" });
  }
  const { result, loyalty } = await processPaidOrder(req);
  return res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    loyalty,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/updated", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  if (req.webhookPayload.cancelled_at || req.webhookPayload.cancel_reason) {
    const orderId = req.webhookPayload.admin_graphql_api_id || req.webhookPayload.id;
    const result = await voidEntriesForOrder(orderId, "Order cancelled");
    const loyalty = reconcileLoyaltyForOrder(req.webhookPayload, webhookContext(req, "orders/updated"));
    return res.status(200).json({ ok: true, ...result, loyalty });
  }
  if (!["paid", "partially_refunded"].includes(String(req.webhookPayload.financial_status || "").toLowerCase())) {
    const loyalty = reconcileLoyaltyForOrder(req.webhookPayload, webhookContext(req, "orders/updated"));
    return res.status(200).json({ ok: true, skipped: "order_not_paid", loyalty });
  }
  const { result, loyalty } = await processPaidOrder(req);
  return res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    loyalty,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/cancelled", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const orderId = req.webhookPayload.admin_graphql_api_id || req.webhookPayload.id;
  const result = await voidEntriesForOrder(orderId, "Order cancelled");
  const loyalty = reconcileLoyaltyForOrder(req.webhookPayload, webhookContext(req, "orders/cancelled"));
  const order = db.prepare("SELECT customer_id FROM orders WHERE shopify_order_id = ?").get(String(orderId).replace(/^.*\//, ""));
  if (order?.customer_id) await syncCustomerDashboardMetafields(order.customer_id);
  res.status(200).json({ ok: true, ...result, loyalty });
});

webhookRouter.post("/refunds/create", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const orderId = req.webhookPayload.order_id || req.webhookPayload.order?.admin_graphql_api_id || req.webhookPayload.order?.id;
  if (!orderId) return res.status(200).json({ ok: true, voided: 0, skipped: "missing_order_id" });
  const result = await voidEntriesForOrder(orderId, "Order refunded");
  const loyalty = applyLoyaltyRefund(orderId, req.webhookPayload, webhookContext(req, "refunds/create"));
  const normalizedOrderId = String(orderId).replace(/^.*\//, "");
  const order = db.prepare("SELECT customer_id FROM orders WHERE shopify_order_id = ?").get(normalizedOrderId);
  if (order?.customer_id) await syncCustomerDashboardMetafields(order.customer_id);
  res.status(200).json({ ok: true, ...result, loyalty });
});

webhookRouter.post("/customers/create", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const result = await syncShopifyCustomerAuctionToken(req.webhookPayload);
  res.status(200).json({ ok: true, auctionToken: result });
});

webhookRouter.post("/customers/update", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const result = await syncShopifyCustomerAuctionToken(req.webhookPayload);
  res.status(200).json({ ok: true, auctionToken: result });
});
