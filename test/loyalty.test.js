import assert from "node:assert/strict";
import test from "node:test";
import { db, id, initDb, nowIso } from "../src/db.js";
import {
  applyLoyaltyRefund,
  buildLoyaltyPayload,
  loyaltyBalance,
  pointsForCents,
  reconcileLoyaltyForOrder,
  redeemLoyaltyReward
} from "../src/services/loyalty.js";

initDb();

function resetDb() {
  db.exec(`
    DELETE FROM webhook_events;
    DELETE FROM loyalty_rewards;
    DELETE FROM loyalty_transactions;
    DELETE FROM auction_bids;
    DELETE FROM auctions;
    DELETE FROM free_entry_claims;
    DELETE FROM lottery_entries;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
  `);
}

function seedOrder({
  shopifyOrderId = "9001",
  totalCents = 7995,
  financialStatus = "paid"
} = {}) {
  const timestamp = nowIso();
  const customerId = id();
  const orderId = id();
  db.prepare(`
    INSERT INTO customers
      (id, shopify_customer_id, email, first_name, last_name, total_entries, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `).run(customerId, "customer-1", "loyalty@example.com", "Loya", "Lid", timestamp, timestamp);
  db.prepare(`
    INSERT INTO orders
      (id, shopify_order_id, order_name, customer_id, email, currency, total_cents, financial_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?)
  `).run(orderId, shopifyOrderId, "#1001", customerId, "loyalty@example.com", totalCents, financialStatus, timestamp, timestamp);
  return { customerId, orderId, shopifyOrderId };
}

test("loyalty rounds down to whole euros and exposes reward progress", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder();

  const result = reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "paid"
  }, { eventId: "paid-9001" });

  assert.equal(pointsForCents(7995), 79);
  assert.equal(result.pointsDelta, 79);
  assert.equal(loyaltyBalance(customerId), 79);
  const payload = buildLoyaltyPayload(customerId);
  assert.equal(payload.balance, 79);
  assert.equal(payload.availableRewards, 0);
  assert.equal(payload.pointsToNextReward, 221);
  assert.equal(payload.progressPoints, 79);
});

test("duplicate paid webhook does not award points twice", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder();
  const payload = { id: shopifyOrderId, total_price: "79.95", financial_status: "paid" };

  reconcileLoyaltyForOrder(payload, { eventId: "same-event" });
  const duplicate = reconcileLoyaltyForOrder(payload, { eventId: "same-event" });

  assert.equal(duplicate.skipped, "webhook_already_processed");
  assert.equal(loyaltyBalance(customerId), 79);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM loyalty_transactions").get().count, 1);
});

test("partial refunds reverse only the corresponding points and are idempotent", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder();
  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "paid"
  }, { eventId: "paid-before-refund" });

  const refundPayload = {
    id: "refund-1",
    transactions: [{ kind: "refund", status: "success", amount: "10.00" }]
  };
  const refund = applyLoyaltyRefund(shopifyOrderId, refundPayload, { eventId: "refund-event-1" });
  const duplicate = applyLoyaltyRefund(shopifyOrderId, refundPayload, { eventId: "refund-event-1" });

  assert.equal(refund.pointsDelta, -10);
  assert.equal(refund.refundCents, 1000);
  assert.equal(duplicate.skipped, "webhook_already_processed");
  assert.equal(loyaltyBalance(customerId), 69);
  const reversal = db.prepare("SELECT * FROM loyalty_transactions WHERE type = 'REFUND_REVERSAL'").get();
  assert.equal(reversal.points, -10);
  assert.equal(reversal.reference, "refund:refund-1");
});

test("an updated partially refunded order uses original total minus the refund once", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder();
  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "paid"
  }, { eventId: "paid-original-total" });

  const result = reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    current_total_price: "69.95",
    total_refunded: "10.00",
    financial_status: "partially_refunded"
  }, { eventId: "updated-partial-refund" });

  assert.equal(result.targetPoints, 69);
  assert.equal(result.pointsDelta, -10);
  assert.equal(loyaltyBalance(customerId), 69);
});

test("a sub-euro refund is deduplicated by Shopify refund id even without a points transaction", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder({ totalCents: 1000 });
  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "10.00",
    financial_status: "paid"
  }, { eventId: "paid-small-refund-order" });

  const refundPayload = {
    id: "tiny-refund",
    transactions: [{ kind: "refund", status: "success", amount: "0.40" }]
  };
  const first = applyLoyaltyRefund(shopifyOrderId, refundPayload, { eventId: "tiny-event-1" });
  const duplicate = applyLoyaltyRefund(shopifyOrderId, refundPayload, { eventId: "tiny-event-2" });

  assert.equal(first.refundedCents, 40);
  assert.equal(first.pointsDelta, -1);
  assert.equal(duplicate.skipped, "webhook_already_processed");
  assert.equal(db.prepare("SELECT refunded_cents FROM orders WHERE shopify_order_id = ?").get(shopifyOrderId).refunded_cents, 40);
  assert.equal(loyaltyBalance(customerId), 9);
});

test("unpaid and cancelled orders do not retain loyalty points", () => {
  resetDb();
  const { customerId, shopifyOrderId } = seedOrder({ financialStatus: "pending" });

  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "pending"
  }, { eventId: "pending-event" });
  assert.equal(loyaltyBalance(customerId), 0);

  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "paid"
  }, { eventId: "paid-event" });
  assert.equal(loyaltyBalance(customerId), 79);

  reconcileLoyaltyForOrder({
    id: shopifyOrderId,
    total_price: "79.95",
    financial_status: "voided",
    cancelled_at: nowIso()
  }, { eventId: "cancelled-event", topic: "orders/cancelled" });
  assert.equal(loyaltyBalance(customerId), 0);
});

test("300 points unlocks one ten euro reward", () => {
  resetDb();
  const { customerId, orderId } = seedOrder({ totalCents: 30000 });
  db.prepare(`
    INSERT INTO loyalty_transactions
      (id, customer_id, order_id, type, points, description, reference, created_at)
    VALUES (?, ?, ?, 'EARNED', 300, '300 punten verdiend', 'seed', ?)
  `).run(id(), customerId, orderId, nowIso());

  const payload = buildLoyaltyPayload(customerId);
  assert.equal(payload.balance, 300);
  assert.equal(payload.availableRewards, 1);
  assert.equal(payload.availableDiscountCents, 1000);
});

test("redemption reserves 300 points and creates a customer-specific reward", async () => {
  resetDb();
  const { customerId, orderId } = seedOrder({ totalCents: 60000 });
  db.prepare(`
    INSERT INTO loyalty_transactions
      (id, customer_id, order_id, type, points, description, reference, created_at)
    VALUES (?, ?, ?, 'EARNED', 600, '600 punten verdiend', 'seed', ?)
  `).run(id(), customerId, orderId, nowIso());
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
  let requestedCustomerId = "";

  const reward = await redeemLoyaltyReward(customer, {
    createDiscount: async ({ shopifyCustomerId }) => {
      requestedCustomerId = shopifyCustomerId;
      return "gid://shopify/DiscountCodeNode/1";
    }
  });

  assert.equal(requestedCustomerId, "customer-1");
  assert.equal(reward.pointsUsed, 300);
  assert.equal(reward.balance, 300);
  assert.match(reward.code, /^MFF-[A-F0-9]{8}$/);
  assert.equal(db.prepare("SELECT status FROM loyalty_rewards").get().status, "ISSUED");
  assert.equal(loyaltyBalance(customerId), 300);
});

test("failed Shopify reward creation restores the reserved points", async () => {
  resetDb();
  const { customerId, orderId } = seedOrder({ totalCents: 30000 });
  db.prepare(`
    INSERT INTO loyalty_transactions
      (id, customer_id, order_id, type, points, description, reference, created_at)
    VALUES (?, ?, ?, 'EARNED', 300, '300 punten verdiend', 'seed', ?)
  `).run(id(), customerId, orderId, nowIso());
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);

  await assert.rejects(
    redeemLoyaltyReward(customer, { createDiscount: async () => { throw new Error("Shopify unavailable"); } }),
    /Shopify unavailable/
  );

  assert.equal(loyaltyBalance(customerId), 300);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM loyalty_rewards").get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM loyalty_transactions WHERE type = 'REDEEMED'").get().count, 0);
});
