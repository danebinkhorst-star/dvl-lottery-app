import express from "express";
import { config } from "../config.js";
import { assignEntriesForOrder, voidEntriesForOrder } from "../services/lottery.js";
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

webhookRouter.post("/orders/paid", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const result = await assignEntriesForOrder(req.webhookPayload);
  res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/create", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  if (req.webhookPayload.financial_status !== "paid") {
    return res.status(200).json({ ok: true, skipped: "order_not_paid" });
  }
  const result = await assignEntriesForOrder(req.webhookPayload);
  return res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/updated", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  if (req.webhookPayload.financial_status !== "paid") {
    return res.status(200).json({ ok: true, skipped: "order_not_paid" });
  }
  const result = await assignEntriesForOrder(req.webhookPayload);
  return res.status(200).json({
    ok: true,
    createdEntries: result.createdEntries.length,
    skipped: result.skipped || null
  });
});

webhookRouter.post("/orders/cancelled", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const orderId = req.webhookPayload.admin_graphql_api_id || req.webhookPayload.id;
  const result = await voidEntriesForOrder(orderId, "Order cancelled");
  res.status(200).json({ ok: true, ...result });
});

webhookRouter.post("/refunds/create", express.raw({ type: "application/json" }), parseWebhook, async (req, res) => {
  const orderId = req.webhookPayload.order_id || req.webhookPayload.order?.admin_graphql_api_id || req.webhookPayload.order?.id;
  if (!orderId) return res.status(200).json({ ok: true, voided: 0, skipped: "missing_order_id" });
  const result = await voidEntriesForOrder(orderId, "Order refunded");
  res.status(200).json({ ok: true, ...result });
});
