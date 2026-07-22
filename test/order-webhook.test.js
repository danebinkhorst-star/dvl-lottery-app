import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";
import { assignEntriesForOrder, createDraw, drawWinner, voidEntriesForOrder } from "../src/services/lottery.js";

function resetDb() {
  db.exec(`
    UPDATE lottery_draws SET winner_entry_id = NULL;
    DELETE FROM free_entry_claims;
    DELETE FROM audit_logs;
    DELETE FROM lottery_entries;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
    DELETE FROM app_settings;
  `);
}

test("paid order at EUR 70 creates one active entry and refund voids it", async () => {
  resetDb();
  await createDraw({
    title: "Test trekking",
    prizeName: "Test prijs",
    status: "LIVE"
  });

  const result = await assignEntriesForOrder({
    id: 12345,
    name: "#1001",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "test@example.com",
    customer: { id: 987, email: "test@example.com", first_name: "Test", last_name: "Klant" },
    line_items: [
      { id: 1, product_id: 101, variant_id: 201, title: "Ribeye", variant_title: "Per kilo", sku: "RIB-1", quantity: 2, price: "25.00" },
      { id: 2, product_id: 102, variant_id: 202, title: "Spareribs", quantity: 1, price: "20.00", total_discount: "5.00" }
    ]
  });

  assert.equal(result.createdEntries.length, 1);
  assert.equal(result.lineItemsSaved, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'ACTIVE'").get().count, 1);
  assert.deepEqual(
    db.prepare("SELECT title, quantity, price_cents, total_cents FROM order_items ORDER BY title").all().map((row) => ({ ...row })),
    [
      { title: "Ribeye", quantity: 2, price_cents: 2500, total_cents: 5000 },
      { title: "Spareribs", quantity: 1, price_cents: 2000, total_cents: 1500 }
    ]
  );

  const retry = await assignEntriesForOrder({
    id: 12345,
    name: "#1001",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "test@example.com",
    customer: { id: 987, email: "test@example.com", first_name: "Test", last_name: "Klant" },
    line_items: [
      { id: 1, product_id: 101, variant_id: 201, title: "Ribeye", variant_title: "Per kilo", sku: "RIB-1", quantity: 3, price: "25.00" }
    ]
  });
  assert.equal(retry.skipped, "order_already_processed");
  assert.equal(db.prepare("SELECT quantity FROM order_items WHERE shopify_line_item_id = '1'").get().quantity, 3);

  const voided = await voidEntriesForOrder("12345", "Refund test");
  assert.equal(voided.voided, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'VOID'").get().count, 1);
});

test("draw winner cannot be run twice", async () => {
  resetDb();
  const draw = await createDraw({
    title: "Double draw guard",
    prizeName: "Test prijs",
    status: "LIVE"
  });

  await assignEntriesForOrder({
    id: 22345,
    name: "#2001",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "winner@example.com",
    customer: { id: 1987, email: "winner@example.com", first_name: "Winner", last_name: "Klant" }
  });
  await assignEntriesForOrder({
    id: 22346,
    name: "#2002",
    total_price: "70.00",
    currency: "EUR",
    financial_status: "paid",
    email: "other@example.com",
    customer: { id: 1988, email: "other@example.com", first_name: "Other", last_name: "Klant" }
  });

  const winner = await drawWinner(draw.id);
  assert.ok(winner.entry_number);
  await assert.rejects(() => drawWinner(draw.id), /already been completed/);
});
