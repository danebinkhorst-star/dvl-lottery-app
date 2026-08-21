import crypto from "node:crypto";
import { db, id, nowIso } from "../db.js";
import { centsFromMoney, formatEuro } from "../utils.js";
import { shopifyGraphql } from "../shopify/admin-api.js";

export const LOYALTY_POINTS_PER_EURO = 1;
export const LOYALTY_REWARD_POINTS = 300;
export const LOYALTY_REWARD_CENTS = 1000;

function normalizeOrderId(value) {
  const raw = String(value || "");
  const match = raw.match(/(\d+)$/);
  return match ? match[1] : raw;
}

function isPaidStatus(status) {
  return ["paid", "partially_refunded"].includes(String(status || "").toLowerCase());
}

function refundCentsFromPayload(payload = {}) {
  if (payload.total_refunded != null) return centsFromMoney(payload.total_refunded);
  const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
  return transactions.reduce((sum, transaction) => {
    const kind = String(transaction?.kind || "").toLowerCase();
    const status = String(transaction?.status || "success").toLowerCase();
    return kind === "refund" && status === "success" ? sum + centsFromMoney(transaction.amount) : sum;
  }, 0);
}

function eventAlreadyProcessed(eventId) {
  return Boolean(eventId && db.prepare("SELECT 1 FROM webhook_events WHERE id = ?").get(eventId));
}

function recordEvent(eventId, topic, resourceId) {
  if (!eventId) return;
  db.prepare(`
    INSERT OR IGNORE INTO webhook_events (id, topic, resource_id, processed_at)
    VALUES (?, ?, ?, ?)
  `).run(eventId, topic || "unknown", String(resourceId || ""), nowIso());
}

function orderPointsTotal(orderId) {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS points
    FROM loyalty_transactions
    WHERE order_id = ?
  `).get(orderId)?.points || 0);
}

export function loyaltyBalance(customerId) {
  return Number(db.prepare(`
    SELECT COALESCE(SUM(points), 0) AS points
    FROM loyalty_transactions
    WHERE customer_id = ?
  `).get(customerId)?.points || 0);
}

export function pointsForCents(cents) {
  return Math.max(0, Math.floor(Number(cents || 0) / 100) * LOYALTY_POINTS_PER_EURO);
}

function reconcileStoredOrder(order, { eventId = "", topic = "orders/paid" } = {}) {
  if (!order?.customer_id) {
    recordEvent(eventId, topic, order?.shopify_order_id || "");
    return { skipped: "missing_customer", pointsDelta: 0 };
  }
  const eligibleCents = Math.max(0, Number(order.loyalty_eligible_cents || 0));
  const targetPoints = pointsForCents(eligibleCents);
  const currentPoints = orderPointsTotal(order.id);
  const pointsDelta = targetPoints - currentPoints;
  if (pointsDelta !== 0) {
    db.prepare(`
      INSERT INTO loyalty_transactions
        (id, customer_id, order_id, type, points, description, reference, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      order.customer_id,
      order.id,
      pointsDelta > 0 ? "EARNED" : "REFUND_REVERSAL",
      pointsDelta,
      pointsDelta > 0
        ? `${pointsDelta} punten verdiend met ${order.order_name || "bestelling"}`
        : `${Math.abs(pointsDelta)} punten teruggedraaid na terugbetaling`,
      String(order.shopify_order_id || ""),
      nowIso()
    );
  }
  recordEvent(eventId, topic, order.shopify_order_id);
  return { targetPoints, pointsDelta, balance: loyaltyBalance(order.customer_id) };
}

export function reconcileLoyaltyForOrder(orderPayload = {}, { eventId = "", topic = "orders/paid" } = {}) {
  const shopifyOrderId = normalizeOrderId(orderPayload.id || orderPayload.admin_graphql_api_id);
  if (!shopifyOrderId) return { skipped: "missing_order_id", pointsDelta: 0 };

  db.exec("BEGIN IMMEDIATE");
  try {
    if (eventAlreadyProcessed(eventId)) {
      db.exec("COMMIT");
      return { skipped: "webhook_already_processed", pointsDelta: 0 };
    }
    const order = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(shopifyOrderId);
    if (!order) {
      recordEvent(eventId, topic, shopifyOrderId);
      db.exec("COMMIT");
      return { skipped: "order_not_stored", pointsDelta: 0 };
    }
    const totalCents = centsFromMoney(orderPayload.total_price ?? orderPayload.current_total_price) || Number(order.total_cents || 0);
    const explicitRefundCents = orderPayload.total_refunded != null ? centsFromMoney(orderPayload.total_refunded) : Number(order.refunded_cents || 0);
    const financialStatus = String(orderPayload.financial_status || order.financial_status || "").toLowerCase();
    const cancelled = Boolean(orderPayload.cancelled_at || orderPayload.cancel_reason) || ["refunded", "voided"].includes(financialStatus);
    const eligibleCents = cancelled || !isPaidStatus(financialStatus)
      ? 0
      : Math.max(0, totalCents - explicitRefundCents);
    db.prepare(`
      UPDATE orders
      SET total_cents = ?, refunded_cents = ?, loyalty_eligible_cents = ?, financial_status = ?, updated_at = ?
      WHERE id = ?
    `).run(totalCents, explicitRefundCents, eligibleCents, financialStatus, nowIso(), order.id);
    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    const result = reconcileStoredOrder(updated, { eventId, topic });
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function applyLoyaltyRefund(shopifyOrderIdValue, refundPayload = {}, { eventId = "", topic = "refunds/create" } = {}) {
  const shopifyOrderId = normalizeOrderId(shopifyOrderIdValue);
  const refundId = String(refundPayload.id || "");
  const refundEventId = refundId ? `shopify-refund:${refundId}` : "";
  db.exec("BEGIN IMMEDIATE");
  try {
    if (eventAlreadyProcessed(eventId) || eventAlreadyProcessed(refundEventId)) {
      db.exec("COMMIT");
      return { skipped: "webhook_already_processed", pointsDelta: 0 };
    }
    const order = db.prepare("SELECT * FROM orders WHERE shopify_order_id = ?").get(shopifyOrderId);
    if (!order) {
      recordEvent(eventId, topic, shopifyOrderId);
      db.exec("COMMIT");
      return { skipped: "order_not_stored", pointsDelta: 0 };
    }
    const reference = refundId ? `refund:${refundId}` : "";
    if (reference && db.prepare("SELECT 1 FROM loyalty_transactions WHERE reference = ? AND order_id = ?").get(reference, order.id)) {
      recordEvent(eventId, topic, shopifyOrderId);
      db.exec("COMMIT");
      return { skipped: "refund_already_processed", pointsDelta: 0 };
    }
    const refundCents = Math.max(0, refundCentsFromPayload(refundPayload));
    const refundedCents = Math.min(Number(order.total_cents || 0), Number(order.refunded_cents || 0) + refundCents);
    const eligibleCents = Math.max(0, Number(order.total_cents || 0) - refundedCents);
    db.prepare(`
      UPDATE orders
      SET refunded_cents = ?, loyalty_eligible_cents = ?, financial_status = ?, updated_at = ?
      WHERE id = ?
    `).run(refundedCents, eligibleCents, eligibleCents > 0 ? "partially_refunded" : "refunded", nowIso(), order.id);
    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    const result = reconcileStoredOrder(updated, { eventId, topic });
    recordEvent(refundEventId, topic, shopifyOrderId);
    if (reference && result.pointsDelta < 0) {
      db.prepare(`
        UPDATE loyalty_transactions
        SET reference = ?
        WHERE id = (
          SELECT id FROM loyalty_transactions
          WHERE order_id = ? AND type = 'REFUND_REVERSAL'
          ORDER BY created_at DESC LIMIT 1
        )
      `).run(reference, order.id);
    }
    db.exec("COMMIT");
    return { ...result, refundCents, refundedCents };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function buildLoyaltyPayload(customerId, { limit = 12 } = {}) {
  const balance = loyaltyBalance(customerId);
  const spendableBalance = Math.max(0, balance);
  const availableRewards = Math.floor(spendableBalance / LOYALTY_REWARD_POINTS);
  const progressPoints = spendableBalance % LOYALTY_REWARD_POINTS;
  const transactions = db.prepare(`
    SELECT lt.*, o.order_name
    FROM loyalty_transactions lt
    LEFT JOIN orders o ON o.id = lt.order_id
    WHERE lt.customer_id = ?
    ORDER BY lt.created_at DESC
    LIMIT ?
  `).all(customerId, Math.max(1, Math.min(50, Number(limit || 12))));
  return {
    balance,
    availableDiscountCents: availableRewards * LOYALTY_REWARD_CENTS,
    availableDiscountLabel: formatEuro(availableRewards * LOYALTY_REWARD_CENTS),
    rewardPoints: LOYALTY_REWARD_POINTS,
    rewardDiscountCents: LOYALTY_REWARD_CENTS,
    rewardDiscountLabel: formatEuro(LOYALTY_REWARD_CENTS),
    availableRewards,
    progressPoints,
    pointsToNextReward: LOYALTY_REWARD_POINTS - progressPoints,
    progressPercent: Math.min(100, Math.round((progressPoints / LOYALTY_REWARD_POINTS) * 100)),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      points: Number(transaction.points || 0),
      description: transaction.description,
      orderName: transaction.order_name || "",
      createdAt: transaction.created_at
    }))
  };
}

export function createRewardCode() {
  return `MFF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function createShopifyRewardDiscount({ code, shopifyCustomerId }) {
  const data = await shopifyGraphql(`
    mutation CreateLoyaltyDiscount($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }
  `, {
    input: {
      title: `MFF loyaltybeloning ${code}`,
      code,
      startsAt: new Date().toISOString(),
      context: {
        customers: {
          add: [`gid://shopify/Customer/${shopifyCustomerId}`]
        }
      },
      customerGets: {
        value: {
          discountAmount: {
            amount: (LOYALTY_REWARD_CENTS / 100).toFixed(2),
            appliesOnEachItem: false
          }
        },
        items: { all: true }
      },
      combinesWith: {
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false
      },
      usageLimit: 1,
      appliesOncePerCustomer: true
    }
  });
  const result = data.discountCodeBasicCreate;
  if (!result) throw new Error("Shopify gaf geen kortingsresultaat terug.");
  if (result.userErrors?.length) {
    throw new Error(result.userErrors.map((error) => error.message).join(" "));
  }
  if (!result.codeDiscountNode?.id) throw new Error("Shopify heeft de kortingscode niet aangemaakt.");
  return result.codeDiscountNode.id;
}

export async function redeemLoyaltyReward(customer, { createDiscount = createShopifyRewardDiscount } = {}) {
  if (!customer?.id || !customer?.shopify_customer_id) {
    throw new Error("Log opnieuw in om punten in te wisselen.");
  }

  const rewardId = id();
  const transactionId = id();
  const code = createRewardCode();
  const createdAt = nowIso();
  const reference = `reward:${rewardId}`;

  db.exec("BEGIN IMMEDIATE");
  try {
    const balance = loyaltyBalance(customer.id);
    if (balance < LOYALTY_REWARD_POINTS) {
      throw new Error(`Je hebt nog ${LOYALTY_REWARD_POINTS - balance} punten nodig voor €10 korting.`);
    }
    db.prepare(`
      INSERT INTO loyalty_rewards
        (id, customer_id, points_cost, discount_cents, discount_code, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'CREATING', ?)
    `).run(rewardId, customer.id, LOYALTY_REWARD_POINTS, LOYALTY_REWARD_CENTS, code, createdAt);
    db.prepare(`
      INSERT INTO loyalty_transactions
        (id, customer_id, order_id, type, points, description, reference, created_at)
      VALUES (?, ?, NULL, 'REDEEMED', ?, ?, ?, ?)
    `).run(
      transactionId,
      customer.id,
      -LOYALTY_REWARD_POINTS,
      `${LOYALTY_REWARD_POINTS} punten ingewisseld voor ${formatEuro(LOYALTY_REWARD_CENTS)} korting`,
      reference,
      createdAt
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  try {
    const shopifyDiscountId = await createDiscount({
      code,
      shopifyCustomerId: customer.shopify_customer_id
    });
    db.prepare(`
      UPDATE loyalty_rewards
      SET shopify_discount_id = ?, status = 'ISSUED'
      WHERE id = ?
    `).run(shopifyDiscountId, rewardId);
    return {
      rewardId,
      code,
      pointsUsed: LOYALTY_REWARD_POINTS,
      discountCents: LOYALTY_REWARD_CENTS,
      discountLabel: formatEuro(LOYALTY_REWARD_CENTS),
      balance: loyaltyBalance(customer.id)
    };
  } catch (error) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM loyalty_transactions WHERE id = ? AND reference = ?").run(transactionId, reference);
      db.prepare("DELETE FROM loyalty_rewards WHERE id = ? AND status = 'CREATING'").run(rewardId);
      db.exec("COMMIT");
    } catch (rollbackError) {
      db.exec("ROLLBACK");
      throw new Error(`${error.message} Puntenreservering kon niet automatisch worden hersteld: ${rollbackError.message}`);
    }
    throw error;
  }
}
