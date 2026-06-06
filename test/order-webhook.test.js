import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/db.js";
import { assignEntriesForOrder, createDraw, voidEntriesForOrder } from "../src/services/lottery.js";

function resetDb() {
  db.exec(`
    DELETE FROM lottery_entries;
    DELETE FROM orders;
    DELETE FROM customers;
    DELETE FROM lottery_draws;
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
    customer: { id: 987, email: "test@example.com", first_name: "Test", last_name: "Klant" }
  });

  assert.equal(result.createdEntries.length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'ACTIVE'").get().count, 1);

  const voided = await voidEntriesForOrder("12345", "Refund test");
  assert.equal(voided.voided, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lottery_entries WHERE status = 'VOID'").get().count, 1);
});
